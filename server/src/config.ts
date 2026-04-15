import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 5001),
  jwtSecret: process.env.JWT_SECRET || "dev_secret_change_me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  isProduction: process.env.NODE_ENV === "production",
  openAIKey: process.env.OPENAI_API_KEY || ""
};

export const AUTH_COOKIE_NAME = "splitmint_token";
