import express, { Request, Response, Application } from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { CognitoIdentityProviderClient, SignUpCommand, InitiateAuthCommand, ConfirmSignUpCommand, ResendConfirmationCodeCommand } from "@aws-sdk/client-cognito-identity-provider";
import * as dotenv from "dotenv";
import crypto from "crypto";
import axios from "axios";
import jwt from "jsonwebtoken";

dotenv.config();

const client = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION,
});

const clientId = process.env.COGNITO_CLIENT_ID!;
const clientSecret = process.env.COGNITO_CLIENT_SECRET;
const cognitoDomain = process.env.COGNITO_DOMAIN;
const redirectUri = "http://localhost:3000/callback";

const app: Application = express();

app.use(bodyParser.json());
app.use(cors());

function calculateSecretHash(clientId: string, clientSecret: string, username: string): string {
    return crypto
      .createHmac("SHA256", clientSecret)
      .update(username + clientId)
      .digest("base64");
}

app.post("/signup", async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password } = req.body;
  
      if (!email || !password) {
        res.status(400).json({ error: "Email and password are required." });
        return;
      }
  
      const secretHash = calculateSecretHash(clientId, process.env.COGNITO_CLIENT_SECRET!, email);
  
      const command = new SignUpCommand({
        ClientId: clientId,
        Username: email,
        Password: password,
        SecretHash: secretHash,
      });
  
      const response = await client.send(command);
      res.status(200).json({
        message: "User signed up successfully.",
        userSub: response.UserSub,
      });
    } catch (error: any) {
      console.error("Signup error:", error);
      res.status(500).json({
        error: error.message || "An error occurred while signing up.",
      });
    }
});

app.post("/login", async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body;
  
    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required." });
      return;
    }
  
    try {
      const secretHash = calculateSecretHash(clientId, process.env.COGNITO_CLIENT_SECRET!, email);
  
      const command = new InitiateAuthCommand({
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: clientId,
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
          SECRET_HASH: secretHash,
        },
      });
  
      const response = await client.send(command);
  
      res.status(200).json({
        message: "Login successful.",
        idToken: response.AuthenticationResult?.IdToken,
        accessToken: response.AuthenticationResult?.AccessToken,
        refreshToken: response.AuthenticationResult?.RefreshToken,
      });
    } catch (error: any) {
      console.error("Login error:", error);
      res.status(401).json({
        error: error.message || "Invalid username or password.",
      });
    }
});

app.post("/confirm-signup", async (req: Request, res: Response): Promise<void> => {
  const { email, confirmationCode } = req.body;

  if (!email || !confirmationCode) {
    res.status(400).json({ error: "Email and confirmation code are required." });
    return;
  }

  try {
    const secretHash = calculateSecretHash(clientId, process.env.COGNITO_CLIENT_SECRET!, email);

    const command = new ConfirmSignUpCommand({
      ClientId: clientId,
      Username: email,
      ConfirmationCode: confirmationCode,
      SecretHash: secretHash
    });

    await client.send(command);

    res.status(200).json({
      message: "User confirmed successfully. You can now log in.",
    });
  } catch (error: any) {
    console.error("Confirmation error:", error);
    res.status(400).json({
      error: error.message || "Unable to confirm the user.",
    });
  }
});

app.post("/resend-confirmation-code", async (req: Request, res: Response): Promise<any> => {
    const { email } = req.body;
  
    if (!email) {
      return res.status(400).json({ error: "Email is required." });
    }
  
    try {
      const secretHash = calculateSecretHash(clientId, process.env.COGNITO_CLIENT_SECRET!, email);

      const command = new ResendConfirmationCodeCommand({
        ClientId: clientId,
        Username: email,
        SecretHash: secretHash
      });
  
      await client.send(command);
  
      res.status(200).json({ message: "Confirmation code resent successfully." });
    } catch (error: any) {
      console.error("Error resending confirmation code:", error);
      res.status(500).json({ error: error.message || "An error occurred while resending the confirmation code." });
    }
});

app.get("/auth/google", (req: Request, res: Response) => {
    const authUrl = `${cognitoDomain}/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&identity_provider=Google&scope=openid%20email%20profile`;
    console.log("Authorization URL:", authUrl);

    res.redirect(authUrl);
});

app.get("/callback", async (req: Request, res: Response): Promise<any> => {
    const { code } = req.query;
  
    if (!code) {
      return res.status(400).send("Authorization code is missing");
    }
  
    try {
      if (!clientSecret) {
        return res.status(500).send("Client secret is not configured");
      }
  
      const params = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code: code as string,
      });
  
      const tokenResponse = await axios.post(
        `${cognitoDomain}/oauth2/token`,
        params.toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );      
  
      console.log("Token exchange response:", tokenResponse.data);
  
      const { id_token, access_token, refresh_token } = tokenResponse.data;
  
      const decodedToken = jwt.decode(id_token);
      console.log("Decoded Token:", decodedToken);
  
      res.status(200).json({
        message: "Login successful",
        id_token,
        access_token,
        refresh_token,
        userInfo: decodedToken,
      });
    } catch (error: any) {
      console.error("Error during token exchange:", error.message);
      res.status(500).json({
        error: error.message || "Token exchange failed",
      });
    }
});

app.get("/admin", async (req: Request, res: Response): Promise<any> => {
    const idToken = req.headers.idtoken;
  
    if (!idToken || typeof idToken !== 'string') {
        return res.status(401).json({ error: "Unauthorized - Invalid token" });
    }
  
    try {
        // Decode the token
        const decodedToken = jwt.decode(idToken);

        if (!decodedToken || typeof decodedToken === 'string') {
            return res.status(400).json({ error: "Invalid token structure" });
        }

        const groups = decodedToken["cognito:groups"]; // This will give an array of groups the user is part of

        if (groups && groups.includes("Admin")) {
            // If the user is an admin, grant access to the admin route
            res.status(200).json({ message: "Welcome Admin!" });
        } else {
            // If not an admin, deny access
            res.status(403).json({ error: "Forbidden - You do not have admin access" });
        }
    } catch (error) {
        console.error("Token decode error:", error);
        res.status(500).json({ error: "Failed to decode token" });
    }
});

const PORT = process.env.PORT || 3000;

//nothing

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
