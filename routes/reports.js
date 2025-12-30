const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const multer = require('multer');

// Configure multer for file upload (memory storage)
const upload = multer({ storage: multer.memoryStorage() });

// Inventory report
router.get('/inventory', authenticateToken, async (req, res) => {
    try {
        // Note: This complex query might need adjustment for Postgres if using specific SQLite syntax,
        // but standard SQL should work for both here.
        const products = await db.query(`
      SELECT p.*, s.name as supplier_name,
        (SELECT COALESCE(SUM(quantity), 0) FROM movements WHERE product_id = p.id AND type = 'entry') as total_entries,
        (SELECT COALESCE(SUM(quantity), 0) FROM movements WHERE product_id = p.id AND type = 'exit') as total_exits,
        (SELECT COALESCE(SUM(quantity), 0) FROM movements WHERE product_id = p.id AND type = 'loss') as total_losses
      FROM products p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      ORDER BY p.name
    `);

        const totalValue = products.reduce((sum, p) => sum + (p.quantity * p.cost_price), 0);
        const lowStockCount = products.filter(p => p.quantity <= p.min_stock).length;

        res.json({
            products,
            summary: {
                total_products: products.length,
                total_value: totalValue,
                low_stock_count: lowStockCount
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao gerar relatório de inventário' });
    }
});

// Monthly expenses comparison
router.get('/expenses', authenticateToken, async (req, res) => {
    try {
        // SQLite uses strftime, Postgres uses to_char. 
        // We need conditioned SQL here.
        let sql;
        if (db.isPostgres) {
            sql = `
          SELECT 
            to_char(created_at, 'YYYY-MM') as month,
            SUM(CASE WHEN type = 'entry' THEN quantity * unit_cost ELSE 0 END) as total_entries,
            SUM(CASE WHEN type = 'exit' THEN quantity * unit_cost ELSE 0 END) as total_exits,
            SUM(CASE WHEN type = 'loss' THEN quantity * unit_cost ELSE 0 END) as total_losses
          FROM movements
          GROUP BY to_char(created_at, 'YYYY-MM')
          ORDER BY month DESC
          LIMIT 12
        `;
        } else {
            sql = `
          SELECT 
            strftime('%Y-%m', created_at) as month,
            SUM(CASE WHEN type = 'entry' THEN quantity * unit_cost ELSE 0 END) as total_entries,
            SUM(CASE WHEN type = 'exit' THEN quantity * unit_cost ELSE 0 END) as total_exits,
            SUM(CASE WHEN type = 'loss' THEN quantity * unit_cost ELSE 0 END) as total_losses
          FROM movements
          GROUP BY strftime('%Y-%m', created_at)
          ORDER BY month DESC
          LIMIT 12
        `;
        }

        const months = await db.query(sql);

        // Calculate averages
        const avgEntries = months.length > 0
            ? months.reduce((sum, m) => sum + parseFloat(m.total_entries), 0) / months.length
            : 0;
        const avgExits = months.length > 0
            ? months.reduce((sum, m) => sum + parseFloat(m.total_exits), 0) / months.length
            : 0;

        res.json({
            months: months.reverse(),
            averages: {
                entries: avgEntries,
                exits: avgExits
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao gerar relatório de gastos' });
    }
});

// Dashboard summary
router.get('/dashboard', authenticateToken, async (req, res) => {
    try {
        // Total products
        const countResult = await db.get('SELECT COUNT(*) as count FROM products');
        const totalProducts = countResult ? countResult.count : 0;

        // Total stock value
        const totalResult = await db.get('SELECT SUM(quantity * cost_price) as total FROM products');
        const stockValue = totalResult ? (totalResult.total || 0) : 0;

        // Low stock alerts (only active products, no limit)
        const lowStockProducts = await db.query(`
      SELECT id, sku, name, quantity, min_stock, unit_type
      FROM products 
      WHERE quantity <= min_stock AND (is_active = 1 OR is_active IS NULL)
      ORDER BY quantity ASC
    `);

        // Recent movements
        const recentMovements = await db.query(`
      SELECT m.*, p.name as product_name, p.sku as product_sku
      FROM movements m
      JOIN products p ON m.product_id = p.id
      ORDER BY m.created_at DESC
      LIMIT 10
    `);

        // Today's summary
        // Need dual SQL again for date functions
        const today = new Date().toISOString().split('T')[0];
        let todaySql, todayParam;

        if (db.isPostgres) {
            todaySql = `
          SELECT 
            SUM(CASE WHEN type = 'entry' THEN 1 ELSE 0 END) as entries,
            SUM(CASE WHEN type = 'exit' THEN 1 ELSE 0 END) as exits,
            SUM(CASE WHEN type = 'loss' THEN 1 ELSE 0 END) as losses
          FROM movements
          WHERE date(created_at) = date($1)
        `;
            todayParam = [today];
        } else {
            todaySql = `
          SELECT 
            SUM(CASE WHEN type = 'entry' THEN 1 ELSE 0 END) as entries,
            SUM(CASE WHEN type = 'exit' THEN 1 ELSE 0 END) as exits,
            SUM(CASE WHEN type = 'loss' THEN 1 ELSE 0 END) as losses
          FROM movements
          WHERE date(created_at) = date(?)
        `;
            todayParam = [today];
        }

        const todayStats = await db.get(todaySql, todayParam);

        // This month vs last month
        const thisMonth = new Date();
        const lastMonth = new Date(thisMonth.getFullYear(), thisMonth.getMonth() - 1, 1);

        let thisMonthSql, lastMonthSql, lastMonthParam;

        if (db.isPostgres) {
            thisMonthSql = `
          SELECT SUM(quantity * unit_cost) as total
          FROM movements
          WHERE type = 'entry' AND to_char(created_at, 'YYYY-MM') = to_char(NOW(), 'YYYY-MM')
        `;
            lastMonthSql = `
          SELECT SUM(quantity * unit_cost) as total
          FROM movements
          WHERE type = 'entry' AND to_char(created_at, 'YYYY-MM') = to_char($1::date, 'YYYY-MM')
        `;
            lastMonthParam = [lastMonth.toISOString()];
        } else {
            thisMonthSql = `
          SELECT SUM(quantity * unit_cost) as total
          FROM movements
          WHERE type = 'entry' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
        `;
            lastMonthSql = `
          SELECT SUM(quantity * unit_cost) as total
          FROM movements
          WHERE type = 'entry' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', ?)
        `;
            lastMonthParam = [lastMonth.toISOString()];
        }

        const thisMonthResult = await db.get(thisMonthSql);
        const thisMonthExpenses = thisMonthResult ? (thisMonthResult.total || 0) : 0;

        const lastMonthResult = await db.get(lastMonthSql, lastMonthParam);
        const lastMonthExpenses = lastMonthResult ? (lastMonthResult.total || 0) : 0;

        res.json({
            total_products: totalProducts,
            stock_value: stockValue,
            low_stock_products: lowStockProducts,
            recent_movements: recentMovements,
            today: todayStats || { entries: 0, exits: 0, losses: 0 },
            comparison: {
                this_month: thisMonthExpenses,
                last_month: lastMonthExpenses,
                difference: thisMonthExpenses - lastMonthExpenses,
                percentage: lastMonthExpenses > 0
                    ? ((thisMonthExpenses - lastMonthExpenses) / lastMonthExpenses * 100).toFixed(1)
                    : 0
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao carregar dashboard' });
    }
});

// Export to Excel
router.get('/export', authenticateToken, async (req, res) => {
    try {
        const { type = 'inventory' } = req.query;

        let data = [];
        let filename = '';

        if (type === 'inventory') {
            data = await db.query(`
        SELECT 
          p.sku as "SKU",
          p.name as "Produto",
          p.description as "Descrição",
          CASE p.unit_type WHEN 'unit' THEN 'Unidade' ELSE 'Peso (kg)' END as "Tipo",
          p.quantity as "Quantidade",
          p.cost_price as "Preço de Custo",
          (p.quantity * p.cost_price) as "Valor Total",
          p.min_stock as "Estoque Mínimo",
          s.name as "Fornecedor"
        FROM products p
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        ORDER BY p.name
      `);
            filename = `inventario_${new Date().toISOString().split('T')[0]}.xlsx`;
        } else if (type === 'movements') {
            // Postgres case syntax is compatible, but string quoting might differ.
            // Standard SQL single quotes are fine.
            data = await db.query(`
        SELECT 
          p.sku as "SKU",
          p.name as "Produto",
          CASE m.type WHEN 'entry' THEN 'Entrada' WHEN 'exit' THEN 'Saída' ELSE 'Perda' END as "Tipo",
          m.quantity as "Quantidade",
          m.unit_cost as "Custo Unitário",
          (m.quantity * m.unit_cost) as "Valor Total",
          m.notes as "Observações",
          m.created_at as "Data"
        FROM movements m
        JOIN products p ON m.product_id = p.id
        ORDER BY m.created_at DESC
      `);
            filename = `movimentacoes_${new Date().toISOString().split('T')[0]}.xlsx`;
        }

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, 'Dados');

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao exportar dados' });
    }
});

// Backup database - Only for SQLite (Local)
router.post('/backup', authenticateToken, async (req, res) => {
    try {
        if (db.isPostgres) {
            return res.status(400).json({ error: 'Backup manual não disponível no modo nuvem (PostgreSQL) - Use o painel do provedor' });
        }

        const backupDir = path.join(__dirname, '..', 'backups');

        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(backupDir, `backup_${timestamp}.db`);
        const sourcePath = path.join(__dirname, '..', 'database', 'stock.db');

        // Need to flush WAL properly? better-sqlite3 handles concurrent reads but copy might grab mid-write.
        // Ideally we use the backup API of sqlite3, but simple copy often works for small traffic.
        // For safer backup, we can use vacuum or backup API. 
        // db.db.backup(backupPath) is cleaner.

        await db.db.backup(backupPath);

        res.json({
            message: 'Backup criado com sucesso',
            filename: `backup_${timestamp}.db`,
            path: backupPath
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao criar backup' });
    }
});

// List backups
router.get('/backups', authenticateToken, (req, res) => {
    try {
        const backupDir = path.join(__dirname, '..', 'backups');

        if (!fs.existsSync(backupDir)) {
            return res.json([]);
        }

        const files = fs.readdirSync(backupDir)
            .filter(f => f.endsWith('.db'))
            .map(f => ({
                filename: f,
                size: fs.statSync(path.join(backupDir, f)).size,
                created: fs.statSync(path.join(backupDir, f)).mtime
            }))
            .sort((a, b) => new Date(b.created) - new Date(a.created));

        res.json(files);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao listar backups' });
    }
});

// ============================================
// BACKUP EXCEL - Download all data as Excel
// ============================================
router.post('/backup-excel', authenticateToken, async (req, res) => {
    try {
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({ error: 'Senha é obrigatória para backup' });
        }

        // Verify password
        const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Senha incorreta' });
        }

        // Get all data
        const products = await db.query('SELECT * FROM products ORDER BY id');
        const suppliers = await db.query('SELECT * FROM suppliers ORDER BY id');
        const movements = await db.query('SELECT * FROM movements ORDER BY id');

        // Create workbook with multiple sheets
        const wb = XLSX.utils.book_new();

        const wsProducts = XLSX.utils.json_to_sheet(products);
        XLSX.utils.book_append_sheet(wb, wsProducts, 'Produtos');

        const wsSuppliers = XLSX.utils.json_to_sheet(suppliers);
        XLSX.utils.book_append_sheet(wb, wsSuppliers, 'Fornecedores');

        const wsMovements = XLSX.utils.json_to_sheet(movements);
        XLSX.utils.book_append_sheet(wb, wsMovements, 'Movimentacoes');

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        const filename = `backup_completo_${new Date().toISOString().split('T')[0]}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao criar backup' });
    }
});

// ============================================
// RESTORE EXCEL - Upload and restore data
// ============================================
router.post('/restore-excel', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({ error: 'Senha é obrigatória para restauração' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'Arquivo Excel é obrigatório' });
        }

        // Verify password
        const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Senha incorreta' });
        }

        // Read Excel file
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });

        // Get sheets
        const suppliersSheet = workbook.Sheets['Fornecedores'];
        const productsSheet = workbook.Sheets['Produtos'];
        const movementsSheet = workbook.Sheets['Movimentacoes'];

        if (!productsSheet && !suppliersSheet && !movementsSheet) {
            return res.status(400).json({ error: 'Arquivo Excel inválido. Deve conter abas: Produtos, Fornecedores, Movimentacoes' });
        }

        let restoredCounts = { suppliers: 0, products: 0, movements: 0 };

        // Restore Suppliers first (products depend on them)
        if (suppliersSheet) {
            const suppliers = XLSX.utils.sheet_to_json(suppliersSheet);
            for (const s of suppliers) {
                // Check if supplier exists
                const existing = await db.get('SELECT id FROM suppliers WHERE id = ?', [s.id]);
                if (!existing && s.name) {
                    await db.run(
                        'INSERT INTO suppliers (id, name, contact, phone, email, address) VALUES (?, ?, ?, ?, ?, ?)',
                        [s.id, s.name, s.contact || '', s.phone || '', s.email || '', s.address || '']
                    );
                    restoredCounts.suppliers++;
                }
            }
        }

        // Restore Products
        if (productsSheet) {
            const products = XLSX.utils.sheet_to_json(productsSheet);
            for (const p of products) {
                const existing = await db.get('SELECT id FROM products WHERE id = ? OR sku = ?', [p.id, p.sku]);
                if (!existing && p.name && p.sku) {
                    await db.run(
                        'INSERT INTO products (id, sku, name, description, unit_type, quantity, cost_price, min_stock, supplier_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                        [p.id, p.sku, p.name, p.description || '', p.unit_type || 'unit', p.quantity || 0, p.cost_price || 0, p.min_stock || 0, p.supplier_id || null]
                    );
                    restoredCounts.products++;
                }
            }
        }

        // Restore Movements
        if (movementsSheet) {
            const movements = XLSX.utils.sheet_to_json(movementsSheet);
            for (const m of movements) {
                const existing = await db.get('SELECT id FROM movements WHERE id = ?', [m.id]);
                if (!existing && m.product_id && m.type && m.quantity) {
                    await db.run(
                        'INSERT INTO movements (id, product_id, type, quantity, unit_cost, notes) VALUES (?, ?, ?, ?, ?, ?)',
                        [m.id, m.product_id, m.type, m.quantity, m.unit_cost || 0, m.notes || '']
                    );
                    restoredCounts.movements++;
                }
            }
        }

        res.json({
            message: 'Restauração concluída com sucesso',
            restored: restoredCounts
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao restaurar backup: ' + error.message });
    }
});

module.exports = router;
