const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

// Generate SKU
function generateSKU() {
    const prefix = 'EST';
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
}

// Get all products
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { search, supplier_id, low_stock } = req.query;

        let query = `
      SELECT p.*, s.name as supplier_name 
      FROM products p 
      LEFT JOIN suppliers s ON p.supplier_id = s.id 
      WHERE 1=1
    `;
        const params = [];

        if (search) {
            query += ' AND (p.name LIKE ? OR p.sku LIKE ? OR p.description LIKE ?)';
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        if (supplier_id) {
            query += ' AND p.supplier_id = ?';
            params.push(supplier_id);
        }

        if (low_stock === 'true') {
            query += ' AND p.quantity <= p.min_stock';
        }

        query += ' ORDER BY p.name ASC';

        const products = await db.query(query, params);
        res.json(products);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao buscar produtos' });
    }
});

// Get single product
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const product = await db.get(`
      SELECT p.*, s.name as supplier_name 
      FROM products p 
      LEFT JOIN suppliers s ON p.supplier_id = s.id 
      WHERE p.id = ?
    `, [req.params.id]);

        if (!product) {
            return res.status(404).json({ error: 'Produto não encontrado' });
        }

        res.json(product);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao buscar produto' });
    }
});

// Create product
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { name, description, unit_type, cost_price, min_stock, supplier_id } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Nome é obrigatório' });
        }

        const sku = generateSKU();

        const result = await db.run(`
      INSERT INTO products (sku, name, description, unit_type, cost_price, min_stock, supplier_id)
      VALUES (?, ?, ?, ?, ?, ?, ?) ${db.isPostgres ? 'RETURNING id' : ''}
    `, [sku, name, description || '', unit_type || 'unit', cost_price || 0, min_stock || 0, supplier_id || null]);

        const id = db.isPostgres ? result.lastID : result.lastID;
        const product = await db.get('SELECT * FROM products WHERE id = ?', [id]);
        res.status(201).json(product);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao criar produto' });
    }
});

// Update product
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { name, description, unit_type, cost_price, min_stock, supplier_id } = req.body;

        const existing = await db.get('SELECT * FROM products WHERE id = ?', [req.params.id]);
        if (!existing) {
            return res.status(404).json({ error: 'Produto não encontrado' });
        }

        await db.run(`
      UPDATE products 
      SET name = ?, description = ?, unit_type = ?, cost_price = ?, min_stock = ?, supplier_id = ?
      WHERE id = ?
    `, [
            name || existing.name,
            description !== undefined ? description : existing.description,
            unit_type || existing.unit_type,
            cost_price !== undefined ? cost_price : existing.cost_price,
            min_stock !== undefined ? min_stock : existing.min_stock,
            supplier_id !== undefined ? supplier_id : existing.supplier_id,
            req.params.id
        ]);

        const product = await db.get('SELECT * FROM products WHERE id = ?', [req.params.id]);
        res.json(product);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao atualizar produto' });
    }
});

// Delete product
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const existing = await db.get('SELECT * FROM products WHERE id = ?', [req.params.id]);
        if (!existing) {
            return res.status(404).json({ error: 'Produto não encontrado' });
        }

        await db.run('DELETE FROM products WHERE id = ?', [req.params.id]);
        res.json({ message: 'Produto excluído com sucesso' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao excluir produto' });
    }
});

module.exports = router;
