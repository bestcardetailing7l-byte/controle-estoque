// Main Application
const API_URL = '';

// State
let products = [];
let suppliers = [];
let movements = [];

// Get auth token
function getToken() {
    return localStorage.getItem('token');
}

// API helper
async function api(endpoint, options = {}) {
    const token = getToken();
    const headers = {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
    };

    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: { ...headers, ...options.headers }
    });

    if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login.html';
        return;
    }

    return response;
}

// Toast notifications
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
    <span>${type === 'success' ? '✅' : type === 'error' ? '❌' : '⚠️'}</span>
    <span>${message}</span>
  `;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Format currency
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value || 0);
}

// Format date
function formatDate(date) {
    return new Date(date).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Modal functions
function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Navigation
function navigateTo(section) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    document.getElementById(`${section}Section`).classList.add('active');
    document.querySelector(`.nav-item[data-section="${section}"]`).classList.add('active');

    // Load section data
    switch (section) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'products':
            loadProducts();
            break;
        case 'suppliers':
            loadSuppliers();
            break;
        case 'movements':
            loadMovements();
            break;
        case 'reports':
            loadReports();
            break;
        case 'settings':
            loadBackups();
            break;
    }
}

// ===== DASHBOARD =====
async function loadDashboard() {
    try {
        const response = await api('/api/reports/dashboard');
        if (!response.ok) throw new Error('Erro ao carregar dashboard');

        const data = await response.json();

        // Update stats
        document.getElementById('totalProducts').textContent = data.total_products;
        document.getElementById('stockValue').textContent = formatCurrency(data.stock_value);
        document.getElementById('lowStockCount').textContent = data.low_stock_products.length;
        document.getElementById('monthComparison').textContent = formatCurrency(data.comparison.this_month);

        // Comparison trend
        const trendEl = document.getElementById('comparisonTrend');
        const diff = data.comparison.difference;
        if (diff > 0) {
            trendEl.innerHTML = `<span class="text-danger">↑ ${data.comparison.percentage}% vs mês anterior</span>`;
        } else if (diff < 0) {
            trendEl.innerHTML = `<span class="text-success">↓ ${Math.abs(data.comparison.percentage)}% vs mês anterior</span>`;
        } else {
            trendEl.innerHTML = '<span class="text-muted">Igual ao mês anterior</span>';
        }

        // Low stock alerts
        const lowStockList = document.getElementById('lowStockList');
        if (data.low_stock_products.length > 0) {
            lowStockList.innerHTML = data.low_stock_products.map(p => `
        <div class="low-stock-item">
          <div class="product-info">
            <span class="product-name">${p.name}</span>
            <span class="product-sku">${p.sku}</span>
          </div>
          <span class="badge badge-danger">${p.quantity} ${p.unit_type === 'weight' ? 'kg' : 'un'}</span>
        </div>
      `).join('');
        } else {
            lowStockList.innerHTML = '<p class="text-muted text-center">Nenhum produto com estoque baixo</p>';
        }

        // Recent movements
        const movementsList = document.getElementById('recentMovements');
        if (data.recent_movements.length > 0) {
            movementsList.innerHTML = data.recent_movements.map(m => `
        <div class="movement-item">
          <div class="movement-icon ${m.type}">
            ${m.type === 'entry' ? '📥' : m.type === 'exit' ? '📤' : '⚠️'}
          </div>
          <div class="movement-info">
            <span class="movement-product">${m.product_name}</span>
            <span class="movement-details">${formatDate(m.created_at)}</span>
          </div>
          <span class="movement-qty ${m.type === 'entry' ? 'text-success' : 'text-danger'}">
            ${m.type === 'entry' ? '+' : '-'}${m.quantity}
          </span>
        </div>
      `).join('');
        } else {
            movementsList.innerHTML = '<p class="text-muted text-center">Nenhuma movimentação recente</p>';
        }
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

// ===== PRODUCTS =====
async function loadProducts() {
    try {
        const search = document.getElementById('productSearch').value;
        const supplier = document.getElementById('supplierFilter').value;
        const lowStock = document.getElementById('lowStockFilter').checked;
        const activeOnly = document.getElementById('activeOnlyFilter').checked;

        let url = '/api/products?';
        if (search) url += `search=${encodeURIComponent(search)}&`;
        if (supplier) url += `supplier_id=${supplier}&`;
        if (lowStock) url += `low_stock=true&`;
        if (activeOnly) url += `active_only=true&`;

        const response = await api(url);
        if (!response.ok) throw new Error('Erro ao carregar produtos');

        products = await response.json();

        const tbody = document.getElementById('productsTable');
        if (products.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Nenhum produto encontrado</td></tr>';
            return;
        }

        tbody.innerHTML = products.map(p => {
            const isInactive = p.is_active === 0;
            const rowClass = isInactive ? 'class="inactive-row"' : '';
            const toggleIcon = isInactive ? '✅' : '⏸️';
            const toggleTitle = isInactive ? 'Reativar' : 'Desativar';

            return `
      <tr ${rowClass}>
        <td><span class="badge badge-info">${p.sku}</span></td>
        <td>${p.name}${isInactive ? ' <span class="badge badge-warning">Inativo</span>' : ''}</td>
        <td>${p.unit_type === 'weight' ? 'Peso (kg)' : 'Unidade'}</td>
        <td>
          <span class="${p.quantity <= p.min_stock && !isInactive ? 'text-danger' : ''}">${p.quantity}</span>
          ${p.quantity <= p.min_stock && !isInactive ? '<span class="badge badge-danger ml-1">Baixo</span>' : ''}
        </td>
        <td>${formatCurrency(p.cost_price)}</td>
        <td>${formatCurrency(p.quantity * p.cost_price)}</td>
        <td>${p.supplier_name || '-'}</td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="editProduct(${p.id})" title="Editar">✏️</button>
          <button class="btn btn-sm ${isInactive ? 'btn-success' : 'btn-warning'}" onclick="toggleProductActive(${p.id})" title="${toggleTitle}">${toggleIcon}</button>
          <button class="btn btn-sm btn-danger" onclick="deleteProduct(${p.id})" title="Excluir">🗑️</button>
        </td>
      </tr>
    `;
        }).join('');
    } catch (error) {
        console.error('Error loading products:', error);
        showToast('Erro ao carregar produtos', 'error');
    }
}

async function loadSupplierOptions() {
    try {
        const response = await api('/api/suppliers');
        if (!response.ok) return;

        suppliers = await response.json();

        const selects = ['supplierFilter', 'productSupplier'];
        selects.forEach(id => {
            const select = document.getElementById(id);
            if (!select) return;

            const currentValue = select.value;
            select.innerHTML = id === 'supplierFilter'
                ? '<option value="">Todos</option>'
                : '<option value="">Nenhum</option>';

            suppliers.forEach(s => {
                select.innerHTML += `<option value="${s.id}">${s.name}</option>`;
            });

            select.value = currentValue;
        });
    } catch (error) {
        console.error('Error loading suppliers:', error);
    }
}

function openProductModal(productId = null) {
    loadSupplierOptions();

    if (productId) {
        const product = products.find(p => p.id === productId);
        if (product) {
            document.getElementById('productModalTitle').textContent = 'Editar Produto';
            document.getElementById('productId').value = product.id;
            document.getElementById('productName').value = product.name;
            document.getElementById('productDescription').value = product.description || '';
            document.getElementById('productUnitType').value = product.unit_type;
            document.getElementById('productCostPrice').value = product.cost_price;
            document.getElementById('productMinStock').value = product.min_stock;
            document.getElementById('productSupplier').value = product.supplier_id || '';
        }
    } else {
        document.getElementById('productModalTitle').textContent = 'Novo Produto';
        document.getElementById('productForm').reset();
        document.getElementById('productId').value = '';
    }

    openModal('productModal');
}

async function saveProduct() {
    const id = document.getElementById('productId').value;
    const data = {
        name: document.getElementById('productName').value,
        description: document.getElementById('productDescription').value,
        unit_type: document.getElementById('productUnitType').value,
        cost_price: parseFloat(document.getElementById('productCostPrice').value) || 0,
        min_stock: parseFloat(document.getElementById('productMinStock').value) || 0,
        supplier_id: document.getElementById('productSupplier').value || null
    };

    // Prevent double-click
    const saveBtn = document.getElementById('saveProductBtn');
    if (saveBtn.disabled) return;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando...';

    try {
        const response = await api(`/api/products${id ? `/${id}` : ''}`, {
            method: id ? 'PUT' : 'POST',
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error);
        }

        showToast(id ? 'Produto atualizado!' : 'Produto criado!');
        closeModal('productModal');
        loadProducts();
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Salvar';
    }
}

function editProduct(id) {
    openProductModal(id);
}

async function deleteProduct(id) {
    if (!confirm('Tem certeza que deseja excluir este produto?')) return;

    try {
        const response = await api(`/api/products/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Erro ao excluir');

        showToast('Produto excluído!');
        loadProducts();
    } catch (error) {
        showToast('Erro ao excluir produto', 'error');
    }
}

async function toggleProductActive(id) {
    try {
        const response = await api(`/api/products/${id}/toggle-active`, { method: 'PATCH' });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error);
        }

        const result = await response.json();
        showToast(result.message);
        loadProducts();
        loadDashboard();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// ===== SUPPLIERS =====
async function loadSuppliers() {
    try {
        const search = document.getElementById('supplierSearch').value;
        let url = '/api/suppliers';
        if (search) url += `?search=${encodeURIComponent(search)}`;

        const response = await api(url);
        if (!response.ok) throw new Error('Erro ao carregar');

        suppliers = await response.json();

        const tbody = document.getElementById('suppliersTable');
        if (suppliers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Nenhum fornecedor encontrado</td></tr>';
            return;
        }

        tbody.innerHTML = suppliers.map(s => `
      <tr>
        <td>${s.name}</td>
        <td>${s.contact || '-'}</td>
        <td>${s.phone || '-'}</td>
        <td>${s.email || '-'}</td>
        <td>${s.address || '-'}</td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="editSupplier(${s.id})">✏️</button>
          <button class="btn btn-sm btn-danger" onclick="deleteSupplier(${s.id})">🗑️</button>
        </td>
      </tr>
    `).join('');
    } catch (error) {
        console.error('Error loading suppliers:', error);
        showToast('Erro ao carregar fornecedores', 'error');
    }
}

function openSupplierModal(supplierId = null) {
    if (supplierId) {
        const supplier = suppliers.find(s => s.id === supplierId);
        if (supplier) {
            document.getElementById('supplierModalTitle').textContent = 'Editar Fornecedor';
            document.getElementById('supplierId').value = supplier.id;
            document.getElementById('supplierName').value = supplier.name;
            document.getElementById('supplierContact').value = supplier.contact || '';
            document.getElementById('supplierPhone').value = supplier.phone || '';
            document.getElementById('supplierEmail').value = supplier.email || '';
            document.getElementById('supplierAddress').value = supplier.address || '';
        }
    } else {
        document.getElementById('supplierModalTitle').textContent = 'Novo Fornecedor';
        document.getElementById('supplierForm').reset();
        document.getElementById('supplierId').value = '';
    }

    openModal('supplierModal');
}

async function saveSupplier() {
    const id = document.getElementById('supplierId').value;
    const data = {
        name: document.getElementById('supplierName').value,
        contact: document.getElementById('supplierContact').value,
        phone: document.getElementById('supplierPhone').value,
        email: document.getElementById('supplierEmail').value,
        address: document.getElementById('supplierAddress').value
    };

    // Prevent double-click
    const saveBtn = document.getElementById('saveSupplierBtn');
    if (saveBtn.disabled) return;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando...';

    try {
        const response = await api(`/api/suppliers${id ? `/${id}` : ''}`, {
            method: id ? 'PUT' : 'POST',
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error);
        }

        showToast(id ? 'Fornecedor atualizado!' : 'Fornecedor criado!');
        closeModal('supplierModal');
        loadSuppliers();
        loadSupplierOptions();
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Salvar';
    }
}

function editSupplier(id) {
    openSupplierModal(id);
}

async function deleteSupplier(id) {
    if (!confirm('Tem certeza que deseja excluir este fornecedor?')) return;

    try {
        const response = await api(`/api/suppliers/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Erro ao excluir');

        showToast('Fornecedor excluído!');
        loadSuppliers();
        loadSupplierOptions();
    } catch (error) {
        showToast('Erro ao excluir fornecedor', 'error');
    }
}

// ===== MOVEMENTS =====
async function loadMovements() {
    try {
        const period = document.getElementById('periodFilter').value;
        const type = document.getElementById('typeFilter').value;
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;

        let url = '/api/movements?';
        if (period && period !== 'custom') url += `period=${period}&`;
        if (type) url += `type=${type}&`;
        if (period === 'custom' && startDate && endDate) {
            url += `start_date=${startDate}&end_date=${endDate}&`;
        }

        const response = await api(url);
        if (!response.ok) throw new Error('Erro ao carregar');

        movements = await response.json();

        const tbody = document.getElementById('movementsTable');
        if (movements.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Nenhuma movimentação encontrada</td></tr>';
            return;
        }

        tbody.innerHTML = movements.map(m => {
            const typeLabel = m.type === 'entry' ? 'Entrada' : m.type === 'exit' ? 'Saída' : 'Perda';
            const typeClass = m.type === 'entry' ? 'success' : m.type === 'exit' ? 'info' : 'danger';

            return `
        <tr>
          <td>${formatDate(m.created_at)}</td>
          <td>${m.product_name}</td>
          <td><span class="badge badge-info">${m.product_sku}</span></td>
          <td><span class="badge badge-${typeClass}">${typeLabel}</span></td>
          <td>${m.quantity}</td>
          <td>${formatCurrency(m.unit_cost)}</td>
          <td>${formatCurrency(m.quantity * m.unit_cost)}</td>
          <td class="notes-cell" title="${m.notes || ''}">${m.notes ? (m.notes.length > 30 ? m.notes.substring(0, 30) + '...' : m.notes) : '-'}</td>
          <td>
            <button class="btn btn-sm btn-secondary" onclick="editMovement(${m.id})" title="Editar">✏️</button>
            <button class="btn btn-sm btn-danger" onclick="deleteMovement(${m.id})" title="Excluir">🗑️</button>
          </td>
        </tr>
      `;
        }).join('');
    } catch (error) {
        console.error('Error loading movements:', error);
        showToast('Erro ao carregar movimentações', 'error');
    }
}

async function loadProductOptions() {
    try {
        const response = await api('/api/products');
        if (!response.ok) return;

        products = await response.json();

        const select = document.getElementById('movementProduct');
        select.innerHTML = '<option value="">Selecione um produto</option>';
        products.forEach(p => {
            const unitLabel = p.unit_type === 'weight' ? 'kg' : 'un';
            select.innerHTML += `<option value="${p.id}" data-cost="${p.cost_price}" data-unit="${p.unit_type}">${p.sku} - ${p.name} (${p.quantity} ${unitLabel})</option>`;
        });
    } catch (error) {
        console.error('Error loading products:', error);
    }
}

// Auto-fill cost when product is selected in entry modal
function onMovementProductChange() {
    const select = document.getElementById('movementProduct');
    const selectedOption = select.options[select.selectedIndex];
    const movementType = document.getElementById('movementType').value;

    if (movementType === 'entry' && selectedOption && selectedOption.dataset.cost) {
        const costField = document.getElementById('movementCost');
        costField.value = parseFloat(selectedOption.dataset.cost).toFixed(2);
    }
}

function openMovementModal(type) {
    loadProductOptions();

    document.getElementById('movementType').value = type;
    document.getElementById('movementForm').reset();

    const titles = {
        entry: '📥 Entrada de Estoque',
        exit: '📤 Saída de Estoque',
        loss: '⚠️ Registrar Perda'
    };
    document.getElementById('movementModalTitle').textContent = titles[type];

    // Show/hide cost and supplier fields (only for entry)
    const costGroup = document.getElementById('movementCostGroup');
    const supplierGroup = document.getElementById('movementSupplierGroup');
    costGroup.classList.toggle('hidden', type !== 'entry');
    supplierGroup.classList.toggle('hidden', type !== 'entry');

    // Load suppliers for entry modal
    if (type === 'entry') {
        loadMovementSupplierOptions();
    }

    openModal('movementModal');
}

async function loadMovementSupplierOptions() {
    try {
        const response = await api('/api/suppliers');
        if (!response.ok) return;

        const suppliersList = await response.json();

        const select = document.getElementById('movementSupplier');
        select.innerHTML = '<option value="">Nenhum / Não informar</option>';
        suppliersList.forEach(s => {
            select.innerHTML += `<option value="${s.id}">${s.name}</option>`;
        });
    } catch (error) {
        console.error('Error loading suppliers:', error);
    }
}

async function saveMovement() {
    const type = document.getElementById('movementType').value;
    const productId = document.getElementById('movementProduct').value;
    const quantity = parseFloat(document.getElementById('movementQuantity').value);
    const unitCost = parseFloat(document.getElementById('movementCost').value) || 0;
    const supplierId = document.getElementById('movementSupplier').value;
    const notes = document.getElementById('movementNotes').value;

    if (!productId || !quantity) {
        showToast('Preencha todos os campos obrigatórios', 'error');
        return;
    }

    try {
        const body = {
            product_id: parseInt(productId),
            quantity,
            unit_cost: unitCost,
            notes
        };

        // Add supplier_id only for entries
        if (type === 'entry' && supplierId) {
            body.supplier_id = parseInt(supplierId);
        }

        const response = await api(`/api/movements/${type}`, {
            method: 'POST',
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error);
        }

        const result = await response.json();

        // Show average cost info for entries
        if (type === 'entry' && result.newAverageCost !== undefined) {
            showToast(`Entrada registrada! Novo custo médio: R$ ${result.newAverageCost.toFixed(2)}`);
        } else {
            const typeLabels = { entry: 'Entrada', exit: 'Saída', loss: 'Perda' };
            showToast(`${typeLabels[type]} registrada com sucesso!`);
        }

        closeModal('movementModal');
        loadMovements();
        loadDashboard();
        loadProducts(); // Refresh products to show new average cost
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// Edit Movement
async function editMovement(id) {
    try {
        const response = await api(`/api/movements/${id}`);
        if (!response.ok) throw new Error('Movimento não encontrado');

        const movement = await response.json();

        document.getElementById('editMovementId').value = movement.id;
        document.getElementById('editMovementProduct').textContent = `${movement.product_name} (${movement.product_sku})`;
        document.getElementById('editMovementType').textContent =
            movement.type === 'entry' ? '📥 Entrada' : movement.type === 'exit' ? '📤 Saída' : '⚠️ Perda';
        document.getElementById('editMovementQuantity').value = movement.quantity;
        document.getElementById('editMovementUnitCost').value = movement.unit_cost;
        document.getElementById('editMovementNotes').value = movement.notes || '';

        openModal('editMovementModal');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function saveEditedMovement() {
    const id = document.getElementById('editMovementId').value;
    const quantity = parseFloat(document.getElementById('editMovementQuantity').value);
    const unit_cost = parseFloat(document.getElementById('editMovementUnitCost').value);
    const notes = document.getElementById('editMovementNotes').value.trim();

    if (!quantity || quantity <= 0) {
        showToast('Quantidade deve ser maior que zero', 'error');
        return;
    }

    const saveBtn = document.querySelector('#editMovementModal .btn-primary');
    const originalText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando...';

    try {
        const response = await api(`/api/movements/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ quantity, unit_cost, notes })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error);
        }

        const result = await response.json();
        showToast(`Movimentação atualizada! Estoque ajustado: ${result.inventoryChange > 0 ? '+' : ''}${result.inventoryChange}`);
        closeModal('editMovementModal');
        loadMovements();
        loadDashboard();
        loadProducts();
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
    }
}

// Delete Movement
async function deleteMovement(id) {
    if (!confirm('Tem certeza que deseja excluir esta movimentação?\n\nIsso irá reverter o efeito no estoque.')) return;

    try {
        const response = await api(`/api/movements/${id}`, { method: 'DELETE' });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error);
        }

        const result = await response.json();
        showToast(`Movimentação excluída! Estoque ajustado: ${result.inventoryChange > 0 ? '+' : ''}${result.inventoryChange}`);
        loadMovements();
        loadDashboard();
        loadProducts();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// ===== EXIT WITH RETURN =====
function openExitReturnModal() {
    loadExitReturnProductOptions();
    document.getElementById('exitReturnForm').reset();
    document.getElementById('consumedQuantity').value = '';
    openModal('exitReturnModal');
}

async function loadExitReturnProductOptions() {
    try {
        const response = await api('/api/products');
        if (!response.ok) return;

        const productsList = await response.json();

        const select = document.getElementById('exitReturnProduct');
        select.innerHTML = '<option value="">Selecione um produto</option>';
        productsList.forEach(p => {
            select.innerHTML += `<option value="${p.id}" data-unit="${p.unit_type}">${p.sku} - ${p.name} (${p.quantity} ${p.unit_type === 'weight' ? 'kg' : 'un'})</option>`;
        });
    } catch (error) {
        console.error('Error loading products:', error);
    }
}

function calculateConsumption() {
    const quantityOut = parseFloat(document.getElementById('quantityOut').value) || 0;
    const quantityReturn = parseFloat(document.getElementById('quantityReturn').value) || 0;

    const consumed = Math.max(0, quantityOut - quantityReturn);
    const consumedField = document.getElementById('consumedQuantity');

    if (quantityOut > 0) {
        consumedField.value = consumed.toFixed(3);

        // Visual feedback
        if (consumed > 0) {
            consumedField.style.color = 'var(--success)';
            consumedField.style.fontWeight = 'bold';
        } else {
            consumedField.style.color = 'var(--danger)';
        }
    } else {
        consumedField.value = '';
    }
}

async function saveExitReturn() {
    const productId = document.getElementById('exitReturnProduct').value;
    const quantityOut = parseFloat(document.getElementById('quantityOut').value);
    const quantityReturn = parseFloat(document.getElementById('quantityReturn').value);
    const notes = document.getElementById('exitReturnNotes').value;

    if (!productId || !quantityOut || quantityReturn === undefined || isNaN(quantityReturn)) {
        showToast('Preencha todos os campos obrigatórios', 'error');
        return;
    }

    if (quantityReturn > quantityOut) {
        showToast('Quantidade de retorno não pode ser maior que a saída', 'error');
        return;
    }

    const consumed = quantityOut - quantityReturn;
    if (consumed <= 0) {
        showToast('Consumo deve ser maior que zero', 'error');
        return;
    }

    try {
        const response = await api('/api/movements/exit-return', {
            method: 'POST',
            body: JSON.stringify({
                product_id: parseInt(productId),
                quantity_out: quantityOut,
                quantity_return: quantityReturn,
                notes
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error);
        }

        const result = await response.json();
        showToast(`Saída com retorno registrada! Consumo: ${result.consumed}`);
        closeModal('exitReturnModal');
        loadMovements();
        loadDashboard();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// ===== REPORTS =====
async function loadReports() {
    try {
        // Load inventory
        const invResponse = await api('/api/reports/inventory');
        if (invResponse.ok) {
            const invData = await invResponse.json();

            const tbody = document.getElementById('inventoryTable');
            tbody.innerHTML = invData.products.map(p => `
        <tr>
          <td><span class="badge badge-info">${p.sku}</span></td>
          <td>${p.name}</td>
          <td>${p.quantity}</td>
          <td>${formatCurrency(p.cost_price)}</td>
          <td>${formatCurrency(p.quantity * p.cost_price)}</td>
          <td class="text-success">${p.total_entries || 0}</td>
          <td class="text-warning">${p.total_exits || 0}</td>
          <td class="text-danger">${p.total_losses || 0}</td>
        </tr>
      `).join('');

            document.getElementById('inventoryTotalValue').textContent = formatCurrency(invData.summary.total_value);
        }

        // Load expenses chart
        const expResponse = await api('/api/reports/expenses');
        if (expResponse.ok) {
            const expData = await expResponse.json();
            renderExpensesChart(expData);
        }
    } catch (error) {
        console.error('Error loading reports:', error);
    }
}

function renderExpensesChart(data) {
    const container = document.getElementById('expensesChart');

    if (data.months.length === 0) {
        container.innerHTML = '<p class="text-center text-muted">Sem dados suficientes para gerar o gráfico</p>';
        return;
    }

    const maxValue = Math.max(...data.months.map(m => m.total_entries));

    container.innerHTML = `
    <div style="display: flex; align-items: flex-end; height: 250px; gap: 12px; padding: 20px;">
      ${data.months.map(m => {
        const height = maxValue > 0 ? (m.total_entries / maxValue * 200) : 0;
        const monthName = new Date(m.month + '-01').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
        return `
          <div style="flex: 1; text-align: center;">
            <div style="background: linear-gradient(to top, var(--primary), var(--secondary)); height: ${Math.max(height, 4)}px; border-radius: 8px 8px 0 0; transition: height 0.3s;"></div>
            <div style="margin-top: 8px; font-size: 0.8rem; color: var(--text-muted);">${monthName}</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary);">${formatCurrency(m.total_entries)}</div>
          </div>
        `;
    }).join('')}
    </div>
    <div style="text-align: center; padding: 16px; border-top: 1px solid var(--border-color);">
      <span style="color: var(--text-muted);">Média de gastos: </span>
      <strong>${formatCurrency(data.averages.entries)}</strong>
    </div>
  `;
}

async function exportToExcel(type) {
    try {
        const response = await api(`/api/reports/export?type=${type}`);
        if (!response.ok) throw new Error('Erro ao exportar');

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = type === 'inventory'
            ? `inventario_${new Date().toISOString().split('T')[0]}.xlsx`
            : `movimentacoes_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        showToast('Arquivo exportado com sucesso!');
    } catch (error) {
        showToast('Erro ao exportar arquivo', 'error');
    }
}

// ===== SETTINGS =====
async function loadBackups() {
    try {
        const response = await api('/api/reports/backups');
        if (!response.ok) return;

        const backups = await response.json();

        const container = document.getElementById('backupsList');
        if (backups.length === 0) {
            container.innerHTML = '<p class="text-muted">Nenhum backup encontrado</p>';
            return;
        }

        container.innerHTML = backups.slice(0, 5).map(b => `
      <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-color);">
        <span>${b.filename}</span>
        <span class="text-muted">${(b.size / 1024).toFixed(1)} KB</span>
      </div>
    `).join('');
    } catch (error) {
        console.error('Error loading backups:', error);
    }
}

async function createBackup() {
    // Show password prompt
    const password = prompt('Digite sua senha para confirmar o backup:');
    if (!password) return;

    try {
        const response = await fetch('/api/reports/backup-excel', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ password })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error);
        }

        // Download the file
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup_completo_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        showToast('Backup criado e baixado com sucesso!');
    } catch (error) {
        showToast(error.message || 'Erro ao criar backup', 'error');
    }
}

async function restoreBackup() {
    // Create file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.xlsx,.xls';

    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const password = prompt('Digite sua senha para confirmar a restauração:');
        if (!password) return;

        if (!confirm('ATENÇÃO: Isso vai adicionar os dados do arquivo ao sistema. Deseja continuar?')) return;

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('password', password);

            const response = await fetch('/api/reports/restore-excel', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${getToken()}`
                },
                body: formData
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error);
            }

            const data = await response.json();
            showToast(`Restauração concluída! Produtos: ${data.restored.products}, Fornecedores: ${data.restored.suppliers}, Movimentações: ${data.restored.movements}`);

            // Reload current section
            loadDashboard();
        } catch (error) {
            showToast(error.message || 'Erro ao restaurar backup', 'error');
        }
    };

    fileInput.click();
}

async function changePassword(e) {
    e.preventDefault();

    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (newPassword !== confirmPassword) {
        showToast('As senhas não coincidem', 'error');
        return;
    }

    try {
        const response = await api('/api/auth/change-password', {
            method: 'POST',
            body: JSON.stringify({ currentPassword, newPassword })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error);
        }

        showToast('Senha alterada com sucesso!');
        document.getElementById('changePasswordForm').reset();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    // Check auth
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    // Set user info
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    document.getElementById('userName').textContent = user.username || 'Admin';

    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => navigateTo(item.dataset.section));
    });

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login.html';
    });

    // Modal close buttons
    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => closeModal(btn.dataset.close));
    });

    // Close modal on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal(overlay.id);
        });
    });

    // Quick actions
    document.querySelectorAll('.quick-action-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            switch (action) {
                case 'quick-exit':
                    navigateTo('dashboard');
                    openMovementModal('exit');
                    break;
                case 'quick-entry':
                    openMovementModal('entry');
                    break;
                case 'quick-loss':
                    openMovementModal('loss');
                    break;
                case 'add-product':
                    navigateTo('products');
                    openProductModal();
                    break;
            }
        });
    });

    // Products
    document.getElementById('addProductBtn').addEventListener('click', () => openProductModal());
    document.getElementById('saveProductBtn').addEventListener('click', saveProduct);
    document.getElementById('productSearch').addEventListener('input', debounce(loadProducts, 300));
    document.getElementById('supplierFilter').addEventListener('change', loadProducts);
    document.getElementById('lowStockFilter').addEventListener('change', loadProducts);

    // Active Only Filter with persistence
    const activeOnlyFilter = document.getElementById('activeOnlyFilter');
    const savedActiveOnly = localStorage.getItem('showActiveOnly');
    if (savedActiveOnly !== null) {
        activeOnlyFilter.checked = savedActiveOnly === 'true';
    }
    activeOnlyFilter.addEventListener('change', () => {
        localStorage.setItem('showActiveOnly', activeOnlyFilter.checked);
        loadProducts();
    });

    // Suppliers
    document.getElementById('addSupplierBtn').addEventListener('click', () => openSupplierModal());
    document.getElementById('saveSupplierBtn').addEventListener('click', saveSupplier);
    document.getElementById('supplierSearch').addEventListener('input', debounce(loadSuppliers, 300));

    // Movements
    document.getElementById('addEntryBtn').addEventListener('click', () => openMovementModal('entry'));
    document.getElementById('addExitBtn').addEventListener('click', () => openMovementModal('exit'));
    document.getElementById('addLossBtn').addEventListener('click', () => openMovementModal('loss'));
    document.getElementById('saveMovementBtn').addEventListener('click', saveMovement);
    document.getElementById('movementProduct').addEventListener('change', onMovementProductChange);
    document.getElementById('periodFilter').addEventListener('change', (e) => {
        document.getElementById('customDateFilter').classList.toggle('hidden', e.target.value !== 'custom');
    });
    document.getElementById('applyFilters').addEventListener('click', loadMovements);

    // Exit Return
    document.getElementById('addExitReturnBtn').addEventListener('click', openExitReturnModal);
    document.getElementById('saveExitReturnBtn').addEventListener('click', saveExitReturn);
    document.getElementById('quantityOut').addEventListener('input', calculateConsumption);
    document.getElementById('quantityReturn').addEventListener('input', calculateConsumption);

    // Edit Movement
    document.getElementById('saveEditMovementBtn').addEventListener('click', saveEditedMovement);

    // Reports
    document.getElementById('exportInventoryBtn').addEventListener('click', () => exportToExcel('inventory'));
    document.getElementById('exportMovementsBtn').addEventListener('click', () => exportToExcel('movements'));

    // Settings
    document.getElementById('changePasswordForm').addEventListener('submit', changePassword);
    document.getElementById('createBackupBtn').addEventListener('click', createBackup);
    document.getElementById('restoreBackupBtn').addEventListener('click', restoreBackup);
    document.getElementById('backupBtn').addEventListener('click', createBackup);

    // Mobile Menu
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mobileOverlay = document.getElementById('mobileOverlay');
    const sidebar = document.getElementById('sidebar');

    function toggleMobileMenu() {
        mobileMenuBtn.classList.toggle('active');
        mobileOverlay.classList.toggle('active');
        sidebar.classList.toggle('active');
    }

    function closeMobileMenu() {
        mobileMenuBtn.classList.remove('active');
        mobileOverlay.classList.remove('active');
        sidebar.classList.remove('active');
    }

    mobileMenuBtn.addEventListener('click', toggleMobileMenu);
    mobileOverlay.addEventListener('click', closeMobileMenu);

    // Close mobile menu when navigating
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', closeMobileMenu);
    });

    // Load initial data
    loadSupplierOptions();
    loadDashboard();
});

// Utility: Debounce
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}
