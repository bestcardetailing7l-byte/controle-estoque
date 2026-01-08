const path = require('path');
require('dotenv').config();

// Configuration
const isProduction = !!process.env.DATABASE_URL;

class DatabaseAdapter {
    constructor() {
        this.isPostgres = isProduction;

        if (this.isPostgres) {
            console.log('🔌 Connecting to PostgreSQL...');
            const { Pool } = require('pg');
            this.pool = new Pool({
                connectionString: process.env.DATABASE_URL,
                ssl: { rejectUnauthorized: false }
            });
        } else {
            console.log('🔌 Connecting to SQLite...');
            const Database = require('better-sqlite3');
            const dbPath = path.join(__dirname, 'stock.db');
            this.db = new Database(dbPath);
            // Enable WAL mode for better performance
            this.db.pragma('journal_mode = WAL');
            this.db.pragma('foreign_keys = ON');
        }
    }

    // Helper to convert parameters from SQLite (?) to Postgres ($1, $2)
    _convertSql(sql) {
        if (!this.isPostgres) return sql;

        let i = 1;
        return sql.replace(/\?/g, () => `$${i++}`);
    }

    // Execute a query that returns multiple rows
    async query(sql, params = []) {
        if (this.isPostgres) {
            const { rows } = await this.pool.query(this._convertSql(sql), params);
            return rows;
        } else {
            return this.db.prepare(sql).all(...params);
        }
    }

    // Execute a query that returns a single row
    async get(sql, params = []) {
        if (this.isPostgres) {
            const { rows } = await this.pool.query(this._convertSql(sql), params);
            return rows[0];
        } else {
            return this.db.prepare(sql).get(...params);
        }
    }

    // Execute a query that modifies data (INSERT, UPDATE, DELETE)
    async run(sql, params = []) {
        if (this.isPostgres) {
            const client = await this.pool.connect();
            try {
                const result = await client.query(this._convertSql(sql), params);
                // Postgres doesn't easily return lastInsertRowid like SQLite
                // For INSERTs, we should use RETURNING id in the SQL query
                return {
                    changes: result.rowCount,
                    lastID: result.rows[0]?.id // Only if RETURNING id is used
                };
            } finally {
                client.release();
            }
        } else {
            const result = this.db.prepare(sql).run(...params);
            return {
                changes: result.changes,
                lastID: result.lastInsertRowid
            };
        }
    }

    // Initialize Schema
    async initSchema() {
        console.log('🏗️ Initializing Database Schema...');

        // Enable unaccent extension for PostgreSQL (accent-insensitive search)
        if (this.isPostgres) {
            try {
                await this.run('CREATE EXTENSION IF NOT EXISTS unaccent');
                console.log('✅ PostgreSQL unaccent extension enabled');
            } catch (err) {
                console.log('ℹ️ unaccent extension may already exist or not available');
            }
        }

        // Schema scripts
        const tables = [
            // Users
            `CREATE TABLE IF NOT EXISTS users (
        id ${this.isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${this.isPostgres ? '' : 'AUTOINCREMENT'},
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at ${this.isPostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP
      )`,
            // Suppliers
            `CREATE TABLE IF NOT EXISTS suppliers (
        id ${this.isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${this.isPostgres ? '' : 'AUTOINCREMENT'},
        name TEXT NOT NULL,
        contact TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        created_at ${this.isPostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP
      )`,
            // Products
            `CREATE TABLE IF NOT EXISTS products (
        id ${this.isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${this.isPostgres ? '' : 'AUTOINCREMENT'},
        sku TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        unit_type TEXT NOT NULL DEFAULT 'unit',
        quantity REAL DEFAULT 0,
        cost_price REAL DEFAULT 0,
        min_stock REAL DEFAULT 0,
        supplier_id INTEGER,
        created_at ${this.isPostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP,
        updated_at ${this.isPostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
      )`,
            // Movements
            `CREATE TABLE IF NOT EXISTS movements (
        id ${this.isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${this.isPostgres ? '' : 'AUTOINCREMENT'},
        product_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit_cost REAL DEFAULT 0,
        notes TEXT,
        created_at ${this.isPostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      )`,
            // Vendors (real suppliers - companies/people they buy from)
            `CREATE TABLE IF NOT EXISTS vendors (
        id ${this.isPostgres ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${this.isPostgres ? '' : 'AUTOINCREMENT'},
        name TEXT NOT NULL,
        phone TEXT,
        created_at ${this.isPostgres ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP
      )`
        ];

        // Indexes
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku)',
            'CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id)',
            'CREATE INDEX IF NOT EXISTS idx_movements_product ON movements(product_id)',
            'CREATE INDEX IF NOT EXISTS idx_movements_type ON movements(type)',
            'CREATE INDEX IF NOT EXISTS idx_movements_date ON movements(created_at)'
        ];

        // Run migrations
        for (const sql of tables) {
            await this.run(sql);
        }

        for (const sql of indexes) {
            await this.run(sql);
        }

        // Triggers (Postgres uses Functions + Triggers, SQLite just Triggers)
        if (this.isPostgres) {
            // Postgres trigger function
            await this.run(`
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = NOW();
                RETURN NEW;
            END;
            $$ language 'plpgsql';
        `);
            // Drop trigger if exists to avoid error on restart
            await this.run(`DROP TRIGGER IF EXISTS update_product_timestamp ON products`);
            await this.run(`
            CREATE TRIGGER update_product_timestamp
            BEFORE UPDATE ON products
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
        `);
        } else {
            await this.run(`
            CREATE TRIGGER IF NOT EXISTS update_product_timestamp 
            AFTER UPDATE ON products
            BEGIN
                UPDATE products SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
            END;
        `);
        }

        // Default Admin User
        const admin = await this.get('SELECT id FROM users WHERE username = ?', ['admin']);
        if (!admin) {
            const bcrypt = require('bcryptjs');
            const passwordHash = await bcrypt.hash('admin123', 10);
            await this.run('INSERT INTO users (username, password_hash) VALUES (?, ?)', ['admin', passwordHash]);
            console.log('✅ Admin user created');
        }

        // Migration: Add is_active column to products if not exists
        try {
            const checkColumn = this.isPostgres
                ? await this.get("SELECT column_name FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_active'")
                : await this.get("SELECT * FROM pragma_table_info('products') WHERE name = 'is_active'");

            if (!checkColumn) {
                await this.run('ALTER TABLE products ADD COLUMN is_active INTEGER DEFAULT 1');
                console.log('✅ Migration: Added is_active column to products');
            }
        } catch (err) {
            // Column might already exist, ignore error
            console.log('ℹ️ is_active column check completed');
        }

        // Migration: Add vendor_id column to movements if not exists
        try {
            const checkVendorCol = this.isPostgres
                ? await this.get("SELECT column_name FROM information_schema.columns WHERE table_name = 'movements' AND column_name = 'vendor_id'")
                : await this.get("SELECT * FROM pragma_table_info('movements') WHERE name = 'vendor_id'");

            if (!checkVendorCol) {
                await this.run('ALTER TABLE movements ADD COLUMN vendor_id INTEGER');
                console.log('✅ Migration: Added vendor_id column to movements');
            }
        } catch (err) {
            console.log('ℹ️ vendor_id column check completed');
        }
    }
}

// Singleton instance
const db = new DatabaseAdapter();
module.exports = db;
