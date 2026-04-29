import process from "node:process";
import dotenv from "dotenv";

dotenv.config();

export const env = {
  host: process.env.FMS_HOST ?? "0.0.0.0",
  port: Number(process.env.FMS_PORT ?? 8000),
  dbPath: process.env.FMS_DB_PATH ?? "./fms.db",
  corsAllowOrigins: process.env.FMS_CORS_ALLOW_ORIGINS ?? "*",
};

