"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const cors_1 = __importDefault(require("cors"));
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const dotenv = __importStar(require("dotenv"));
const crypto_1 = __importDefault(require("crypto"));
const axios_1 = __importDefault(require("axios"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
dotenv.config();
const client = new client_cognito_identity_provider_1.CognitoIdentityProviderClient({
    region: process.env.AWS_REGION,
});
const clientId = process.env.COGNITO_CLIENT_ID;
const clientSecret = process.env.COGNITO_CLIENT_SECRET;
const cognitoDomain = process.env.COGNITO_DOMAIN;
const redirectUri = "http://localhost:3000/callback";
const app = (0, express_1.default)();
app.use(body_parser_1.default.json());
app.use((0, cors_1.default)());
function calculateSecretHash(clientId, clientSecret, username) {
    return crypto_1.default
        .createHmac("SHA256", clientSecret)
        .update(username + clientId)
        .digest("base64");
}
app.post("/signup", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            res.status(400).json({ error: "Email and password are required." });
            return;
        }
        const secretHash = calculateSecretHash(clientId, process.env.COGNITO_CLIENT_SECRET, email);
        const command = new client_cognito_identity_provider_1.SignUpCommand({
            ClientId: clientId,
            Username: email,
            Password: password,
            SecretHash: secretHash,
        });
        const response = yield client.send(command);
        res.status(200).json({
            message: "User signed up successfully.",
            userSub: response.UserSub,
        });
    }
    catch (error) {
        console.error("Signup error:", error);
        res.status(500).json({
            error: error.message || "An error occurred while signing up.",
        });
    }
}));
app.post("/login", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const { email, password } = req.body;
    if (!email || !password) {
        res.status(400).json({ error: "Email and password are required." });
        return;
    }
    try {
        const secretHash = calculateSecretHash(clientId, process.env.COGNITO_CLIENT_SECRET, email);
        const command = new client_cognito_identity_provider_1.InitiateAuthCommand({
            AuthFlow: "USER_PASSWORD_AUTH",
            ClientId: clientId,
            AuthParameters: {
                USERNAME: email,
                PASSWORD: password,
                SECRET_HASH: secretHash,
            },
        });
        const response = yield client.send(command);
        res.status(200).json({
            message: "Login successful.",
            idToken: (_a = response.AuthenticationResult) === null || _a === void 0 ? void 0 : _a.IdToken,
            accessToken: (_b = response.AuthenticationResult) === null || _b === void 0 ? void 0 : _b.AccessToken,
            refreshToken: (_c = response.AuthenticationResult) === null || _c === void 0 ? void 0 : _c.RefreshToken,
        });
    }
    catch (error) {
        console.error("Login error:", error);
        res.status(401).json({
            error: error.message || "Invalid username or password.",
        });
    }
}));
app.post("/confirm-signup", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, confirmationCode } = req.body;
    if (!email || !confirmationCode) {
        res.status(400).json({ error: "Email and confirmation code are required." });
        return;
    }
    try {
        const secretHash = calculateSecretHash(clientId, process.env.COGNITO_CLIENT_SECRET, email);
        const command = new client_cognito_identity_provider_1.ConfirmSignUpCommand({
            ClientId: clientId,
            Username: email,
            ConfirmationCode: confirmationCode,
            SecretHash: secretHash
        });
        yield client.send(command);
        res.status(200).json({
            message: "User confirmed successfully. You can now log in.",
        });
    }
    catch (error) {
        console.error("Confirmation error:", error);
        res.status(400).json({
            error: error.message || "Unable to confirm the user.",
        });
    }
}));
app.post("/resend-confirmation-code", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ error: "Email is required." });
    }
    try {
        const secretHash = calculateSecretHash(clientId, process.env.COGNITO_CLIENT_SECRET, email);
        const command = new client_cognito_identity_provider_1.ResendConfirmationCodeCommand({
            ClientId: clientId,
            Username: email,
            SecretHash: secretHash
        });
        yield client.send(command);
        res.status(200).json({ message: "Confirmation code resent successfully." });
    }
    catch (error) {
        console.error("Error resending confirmation code:", error);
        res.status(500).json({ error: error.message || "An error occurred while resending the confirmation code." });
    }
}));
app.get("/auth/google", (req, res) => {
    const authUrl = `${cognitoDomain}/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&identity_provider=Google&scope=openid%20email%20profile`;
    console.log("Authorization URL:", authUrl);
    res.redirect(authUrl);
});
app.get("/callback", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
            code: code,
        });
        const tokenResponse = yield axios_1.default.post(`${cognitoDomain}/oauth2/token`, params.toString(), {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
        });
        console.log("Token exchange response:", tokenResponse.data);
        const { id_token, access_token, refresh_token } = tokenResponse.data;
        const decodedToken = jsonwebtoken_1.default.decode(id_token);
        console.log("Decoded Token:", decodedToken);
        res.status(200).json({
            message: "Login successful",
            id_token,
            access_token,
            refresh_token,
            userInfo: decodedToken,
        });
    }
    catch (error) {
        console.error("Error during token exchange:", error.message);
        res.status(500).json({
            error: error.message || "Token exchange failed",
        });
    }
}));
app.get("/admin", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const idToken = req.headers.idtoken;
    if (!idToken || typeof idToken !== 'string') {
        return res.status(401).json({ error: "Unauthorized - Invalid token" });
    }
    try {
        // Decode the token
        const decodedToken = jsonwebtoken_1.default.decode(idToken);
        if (!decodedToken || typeof decodedToken === 'string') {
            return res.status(400).json({ error: "Invalid token structure" });
        }
        const groups = decodedToken["cognito:groups"]; // This will give an array of groups the user is part of
        if (groups && groups.includes("Admin")) {
            // If the user is an admin, grant access to the admin route
            res.status(200).json({ message: "Welcome Admin!" });
        }
        else {
            // If not an admin, deny access
            res.status(403).json({ error: "Forbidden - You do not have admin access" });
        }
    }
    catch (error) {
        console.error("Token decode error:", error);
        res.status(500).json({ error: "Failed to decode token" });
    }
}));
const PORT = process.env.PORT || 3000;
//nothing
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
