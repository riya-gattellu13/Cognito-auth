const { MongoClient } = require("mongodb");
const { Client } = require("pg");
const { v4: uuidv4 } = require("uuid");

(async () => {
  const mongoUri = "mongodb://localhost:27017";
  const mongoClient = new MongoClient(mongoUri);
  await mongoClient.connect();
  console.log("Connected to MongoDB");

  const mongoDb = mongoClient.db("admin");
  const collections = await mongoDb.listCollections().toArray();
  console.log("Collections in MongoDB:", collections.map(col => col.name));

  const pgClient = new Client({
    user: "postgres",
    host: "localhost",
    database: "my_pg_database",
    password: "your_password",
    port: 5432,
  });
  await pgClient.connect();
  console.log("Connected to PostgreSQL");

  for (const collection of collections) {
    const collectionName = collection.name;
    if (collectionName === "system.version") continue;

    const mongoCollection = mongoDb.collection(collectionName);
    const documents = await mongoCollection.find().toArray();
    console.log(`Fetched data from MongoDB collection "${collectionName}"`);

    if (documents.length === 0) continue;

    const transformedData = documents.map(doc => {
      const { _id, ...rest } = doc;
      return { id: uuidv4(), ...rest };
    });

    const columns = Object.keys(transformedData[0]);

    const tableColumns = columns.filter(col => col !== "id").map(col => {
      let columnType = 'TEXT';
      if (typeof transformedData[0][col] === 'number') {
        columnType = 'FLOAT';
      } else if (typeof transformedData[0][col] === 'boolean') {
        columnType = 'BOOLEAN';
      } else if (transformedData[0][col] instanceof Date) {
        columnType = 'TIMESTAMPTZ';
      }
      return `${col} ${columnType}`;
    });

    const tableCreationQuery = `
      CREATE TABLE IF NOT EXISTS ${collectionName} (
        id UUID PRIMARY KEY,
        ${tableColumns.join(", ")}
      );
    `;
    await pgClient.query(tableCreationQuery);
    console.log(`Table "${collectionName}" created in PostgreSQL`);

    for (const item of transformedData) {
      const columnsToInsert = Object.keys(item).filter(col => col !== "id");
      const values = columnsToInsert.map(col => item[col]);
      const query = `
        INSERT INTO ${collectionName} (id, ${columnsToInsert.join(', ')})
        VALUES ($1, ${columnsToInsert.map((_, idx) => `$${idx + 2}`).join(', ')})
      `;
      await pgClient.query(query, [item.id, ...values]);
    }

    console.log(`Data migrated successfully for collection "${collectionName}"`);
  }

  await pgClient.end();
  await mongoClient.close();
})();
