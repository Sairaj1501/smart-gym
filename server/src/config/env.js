import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT || 5000),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smart_gym',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  llmModel: process.env.LLM_MODEL || 'claude-sonnet-5-5',
};

export function assertEnv() {
  if (env.jwtSecret.length < 32) throw new Error('JWT_SECRET must be set to a random string of at least 32 characters (see .env.example).');
}
