import knex from 'knex';
import path from 'node:path';
import { DATA_DIR } from './config.js';

const DEFAULT_TYPE = process.env.DB_TYPE || 'sqlite';

const config = {
  sqlite: {
    client: 'better-sqlite3',
    connection: {
      filename: path.join(DATA_DIR, 'gpuhunter.sqlite')
    },
    useNullAsDefault: true
  },
  postgres: {
    client: 'pg',
    connection: process.env.DATABASE_URL || {
      host: process.env.PG_HOST || 'localhost',
      port: Number(process.env.PG_PORT || 5432),
      user: process.env.PG_USER || 'postgres',
      password: process.env.PG_PASSWORD || '',
      database: process.env.PG_DATABASE || 'gpuhunter'
    },
    useNullAsDefault: true
  }
};

const db = knex(config[DEFAULT_TYPE] === 'postgres' ? config.postgres : config.sqlite);

let initialized = false;

async function ensureTables() {
  if (initialized) return;
  const hasProducts = await db.schema.hasTable('products');
  if (!hasProducts) {
    await db.schema.createTable('products', (table) => {
      table.string('id').primary();
      table.string('model_name');
      table.string('store');
      table.string('product_url', 1024);
      table.string('image_url', 1024);
      table.timestamp('created_at');
      table.timestamp('updated_at');
      table.index(['store']);
      table.index(['model_name']);
    });
  }
  const hasPriceHistory = await db.schema.hasTable('price_history');
  if (!hasPriceHistory) {
    await db.schema.createTable('price_history', (table) => {
      table.increments('id').primary();
      table.string('product_id');
      table.decimal('price', 12, 2);
      table.timestamp('recorded_at');
      table.index(['product_id']);
      table.index(['recorded_at']);
    });
  }
  initialized = true;
}

export async function initDb() {
  await ensureTables();
  return db;
}

export { db };
