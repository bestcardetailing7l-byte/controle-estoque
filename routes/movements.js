const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

// Entry (add stock)
router.post('/entry', authenticateToken, async (req, res) => {
    try {
        const { product_id, quantity, unit_cost, notes } = req.body;

        if (!product_id || !quantity || quantity <= 0) {
            return res.status(400).json({ error: 'Produto e quantidade válida são obrigatórios' });
        }

        const product = await db.get('SELECT * FROM products WHERE id = ?', [product_id]);
        if (!product) {
            return res.status(404).json({ error: 'Produto não encontrado' });
        }

        // Create movement
        await db.run(`
      INSERT INTO movements (product_id, type, quantity, unit_cost, notes)
      VALUES (?, 'entry', ?, ?, ?)
    `, [product_id, quantity, unit_cost || product.cost_price, notes || '']);

        // Update stock
        const newQuantity = product.quantity + quantity;
        const newCostPrice = unit_cost || product.cost_price;
        await db.run('UPDATE products SET quantity = ?, cost_price = ? WHERE id = ?', [newQuantity, newCostPrice, product_id]);

        const updatedProduct = await db.get('SELECT * FROM products WHERE id = ?', [product_id]);
        res.json({ message: 'Entrada registrada com sucesso', product: updatedProduct });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao registrar entrada' });
    }
});

// Exit (remove stock)
router.post('/exit', authenticateToken, async (req, res) => {
    try {
        const { product_id, quantity, notes } = req.body;

        if (!product_id || !quantity || quantity <= 0) {
            return res.status(400).json({ error: 'Produto e quantidade válida são obrigatórios' });
        }

        const product = await db.get('SELECT * FROM products WHERE id = ?', [product_id]);
        if (!product) {
            return res.status(404).json({ error: 'Produto não encontrado' });
        }

        if (product.quantity < quantity) {
            return res.status(400).json({ error: 'Quantidade insuficiente em estoque' });
        }

        // Create movement
        await db.run(`
      INSERT INTO movements (product_id, type, quantity, unit_cost, notes)
      VALUES (?, 'exit', ?, ?, ?)
    `, [product_id, quantity, product.cost_price, notes || '']);

        // Update stock
        const newQuantity = product.quantity - quantity;
        await db.run('UPDATE products SET quantity = ? WHERE id = ?', [newQuantity, product_id]);

        const updatedProduct = await db.get('SELECT * FROM products WHERE id = ?', [product_id]);
        res.json({ message: 'Saída registrada com sucesso', product: updatedProduct });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao registrar saída' });
    }
});

// Loss (register loss/damage)
router.post('/loss', authenticateToken, async (req, res) => {
    try {
        const { product_id, quantity, notes } = req.body;

        if (!product_id || !quantity || quantity <= 0) {
            return res.status(400).json({ error: 'Produto e quantidade válida são obrigatórios' });
        }

        const product = await db.get('SELECT * FROM products WHERE id = ?', [product_id]);
        if (!product) {
            return res.status(404).json({ error: 'Produto não encontrado' });
        }

        if (product.quantity < quantity) {
            return res.status(400).json({ error: 'Quantidade insuficiente em estoque' });
        }

        // Create movement
        await db.run(`
      INSERT INTO movements (product_id, type, quantity, unit_cost, notes)
      VALUES (?, 'loss', ?, ?, ?)
    `, [product_id, quantity, product.cost_price, notes || '']);

        // Update stock
        const newQuantity = product.quantity - quantity;
        await db.run('UPDATE products SET quantity = ? WHERE id = ?', [newQuantity, product_id]);

        const updatedProduct = await db.get('SELECT * FROM products WHERE id = ?', [product_id]);
        res.json({ message: 'Perda registrada com sucesso', product: updatedProduct });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao registrar perda' });
    }
});

// Get movements with filters
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { product_id, type, start_date, end_date, period } = req.query;

        let query = `
      SELECT m.*, p.name as product_name, p.sku as product_sku
      FROM movements m
      JOIN products p ON m.product_id = p.id
      WHERE 1=1
    `;
        const params = [];

        if (product_id) {
            query += ' AND m.product_id = ?';
            params.push(product_id);
        }

        if (type) {
            query += ' AND m.type = ?';
            params.push(type);
        }

        // Period filters
        if (period) {
            const now = new Date();
            let startDate;

            switch (period) {
                case 'daily':
                    startDate = new Date(now.setHours(0, 0, 0, 0));
                    break;
                case 'weekly':
                    startDate = new Date(now.setDate(now.getDate() - 7));
                    break;
                case 'biweekly':
                    startDate = new Date(now.setDate(now.getDate() - 14));
                    break;
                case 'monthly':
                    startDate = new Date(now.setMonth(now.getMonth() - 1));
                    break;
            }

            if (startDate) {
                query += ' AND m.created_at >= ?';
                params.push(startDate.toISOString());
            }
        } else if (start_date && end_date) {
            query += ' AND m.created_at >= ? AND m.created_at <= ?';
            params.push(start_date, end_date);
        }

        query += ' ORDER BY m.created_at DESC';

        const movements = await db.query(query, params);
        res.json(movements);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao buscar movimentações' });
    }
});

module.exports = router;
