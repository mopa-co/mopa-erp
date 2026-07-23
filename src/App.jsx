import React, { useState, useMemo, useEffect } from "react";
import {
  Package, Plus, Search, ArrowDownCircle, ArrowUpCircle,
  X, History, Boxes, CircleDollarSign, TriangleAlert, Loader2, WifiOff, Settings2, Trash2,
  Calculator, Sliders
} from "lucide-react";

// --- Conexión a Supabase (proyecto: mopa-erp) ---
const SUPABASE_URL = "https://sqohaorxfgyzrprybaea.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxb2hhb3J4Zmd5enJwcnliYWVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1MTEwOTQsImV4cCI6MjEwMDA4NzA5NH0.8CtlUfU5KNAV8SS6qEE9Ip-53CaMUyzXSUycjMqYIXg";

async function sb(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase ${res.status}: ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const productFromDB = (r) => ({
  id: r.id, sku: r.sku, name: r.name, category: r.category, color: r.color, diseno: r.diseno,
  unit: r.unit, minStock: r.min_stock, stock: r.stock, unitValue: Number(r.unit_value),
  codCategoria: r.cod_categoria, codSegmento: r.cod_segmento, codLinea: r.cod_linea, codDiseno: r.cod_diseno,
  consecutivo: r.consecutivo, codColor: r.cod_color, codTalla: r.cod_talla, masterCode: r.master_code,
  costoTotal: Number(r.costo_total || 0), precioMayorista: Number(r.precio_mayorista || 0), precioDetal: Number(r.precio_detal || 0),
  utilidadMayoristaPersonalizada: r.utilidad_mayorista_personalizada != null ? Number(r.utilidad_mayorista_personalizada) : null,
  utilidadDetalPersonalizada: r.utilidad_detal_personalizada != null ? Number(r.utilidad_detal_personalizada) : null,
});
const movementFromDB = (r) => ({
  id: r.id, productId: r.product_id, sku: r.sku, type: r.type, qty: r.qty, reason: r.reason, date: r.date,
});
const catFromDB = (r) => ({ cod: r.cod, nombre: r.nombre, tipo: r.tipo || null });
const materialFromDB = (r) => ({ id: r.id, detalle: r.detalle, proveedor: r.proveedor, valorUnitario: Number(r.valor_unitario), cantidad: Number(r.cantidad) });
const manoObraFromDB = (r) => ({ id: r.id, area: r.area, detalle: r.detalle, valorUnitario: Number(r.valor_unitario), cantidad: Number(r.cantidad) });
const asuncionesFromDB = (r) => ({ cifPct: Number(r.cif_pct), margenMayoristaPct: Number(r.margen_mayorista_pct), margenDetalPct: Number(r.margen_detal_pct), ivaPct: Number(r.iva_pct) });
const masterFromDB = (r) => ({
  masterCode: r.master_code, costoTotal: Number(r.costo_total || 0), precioMayorista: Number(r.precio_mayorista || 0), precioDetal: Number(r.precio_detal || 0),
  utilidadMayoristaPersonalizada: r.utilidad_mayorista_personalizada != null ? Number(r.utilidad_mayorista_personalizada) : null,
  utilidadDetalPersonalizada: r.utilidad_detal_personalizada != null ? Number(r.utilidad_detal_personalizada) : null,
});
const EMPTY_MASTER = { costoTotal: 0, precioMayorista: 0, precioDetal: 0, utilidadMayoristaPersonalizada: null, utilidadDetalPersonalizada: null };

async function saveMaster(masterCode, fields) {
  const [row] = await sb(`product_masters?on_conflict=master_code`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ master_code: masterCode, ...fields }),
  });
  return row;
}

function calcularCosteo(materiales, manoObra, asunciones, utilidadMayPersonalizada, utilidadDetPersonalizada) {
  const materiaPrimaTotal = materiales.reduce((a, m) => a + m.valorUnitario * m.cantidad, 0);
  const manoObraTotal = manoObra.reduce((a, m) => a + m.valorUnitario * m.cantidad, 0);
  const costoDirecto = materiaPrimaTotal + manoObraTotal;
  const cif = costoDirecto * (asunciones?.cifPct ?? 0);
  const costoTotal = costoDirecto + cif;

  const mMay = asunciones?.margenMayoristaPct ?? 0;
  const mDet = asunciones?.margenDetalPct ?? 0;
  const utilidadMaySugerida = mMay < 1 ? costoTotal * (mMay / (1 - mMay)) : 0;
  const utilidadDetSugerida = mDet < 1 ? costoTotal * (mDet / (1 - mDet)) : 0;
  const utilidadMay = utilidadMayPersonalizada != null ? utilidadMayPersonalizada : utilidadMaySugerida;
  const utilidadDet = utilidadDetPersonalizada != null ? utilidadDetPersonalizada : utilidadDetSugerida;

  const precioMaySinIva = costoTotal + utilidadMay;
  const precioDetSinIva = costoTotal + utilidadDet;
  const iva = asunciones?.ivaPct ?? 0;
  const precioMayConIva = precioMaySinIva * (1 + iva);
  const precioDetConIva = precioDetSinIva * (1 + iva);

  return {
    materiaPrimaTotal, manoObraTotal, costoDirecto, cif, costoTotal,
    utilidadMaySugerida, utilidadDetSugerida, utilidadMay, utilidadDet,
    precioMaySinIva, precioDetSinIva, precioMayConIva, precioDetConIva,
  };
}

const CATALOG_TABLES = {
  categorias: "mopa_categorias",
  segmentos: "mopa_segmentos",
  lineas: "mopa_lineas",
  disenos: "mopa_disenos",
  colores: "mopa_colores",
  tallas: "mopa_tallas",
};
const CATALOG_LABELS = {
  categorias: "Categoría", segmentos: "Segmento", lineas: "Línea",
  disenos: "Diseño", colores: "Color", tallas: "Talla",
};

const TOKENS = {
  bg: "#EEF0F2", panel: "#FFFFFF", ink: "#1B2430", inkSoft: "#5B6472", border: "#D5D9DE",
  amber: "#E8A33D", amberSoft: "#FCEDD6", good: "#2F8F7A", goodSoft: "#E1F1EC",
  warn: "#C4783B", warnSoft: "#FBE9D9", crit: "#C4483B", critSoft: "#FAE1DE",
};
const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');`;


const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtMoney = (n) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const fmtDate = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
const pad2 = (n) => String(n).padStart(2, "0");

function StockGauge({ stock, min }) {
  const ratio = min > 0 ? stock / (min * 2) : 1;
  const pct = Math.max(4, Math.min(100, ratio * 100));
  let color = TOKENS.good;
  if (stock < min) color = TOKENS.crit;
  else if (stock < min * 1.3) color = TOKENS.warn;
  return (
    <div style={{ width: 110 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600, color: TOKENS.ink }}>{stock}</span>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: TOKENS.inkSoft }}>mín {min}</span>
      </div>
      <div style={{ position: "relative", height: 6, background: "#E4E7EB", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: color, borderRadius: 3, transition: "width .3s" }} />
        <div style={{ position: "absolute", left: `${Math.min(96, (min / (min * 2)) * 100)}%`, top: -2, bottom: -2, width: 2, background: TOKENS.ink, opacity: 0.35 }} />
      </div>
    </div>
  );
}

function Badge({ children, tone = "good" }) {
  const map = {
    good: { bg: TOKENS.goodSoft, fg: TOKENS.good },
    warn: { bg: TOKENS.warnSoft, fg: TOKENS.warn },
    crit: { bg: TOKENS.critSoft, fg: TOKENS.crit },
  };
  const c = map[tone];
  return (
    <span style={{ background: c.bg, color: c.fg, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 4, letterSpacing: 0.3 }}>
      {children}
    </span>
  );
}

export default function InventarioProductoTerminado() {
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [catalogs, setCatalogs] = useState({ categorias: [], segmentos: [], lineas: [], disenos: [], colores: [], tallas: [] });
  const [masters, setMasters] = useState({});
  const [asunciones, setAsunciones] = useState(null);
  const [showAsunciones, setShowAsunciones] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [movementFor, setMovementFor] = useState(null);
  const [catalogModalTab, setCatalogModalTab] = useState(null); // string key or null

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [prodRows, movRows, asuncionesRows, masterRows, ...catRows] = await Promise.all([
        sb("products?select=*&order=created_at.asc", { method: "GET" }),
        sb("movements?select=*&order=created_at.desc&limit=200", { method: "GET" }),
        sb("mopa_asunciones?select=*&id=eq.1", { method: "GET" }),
        sb("product_masters?select=*", { method: "GET" }),
        ...Object.values(CATALOG_TABLES).map(t => sb(`${t}?select=*&order=orden.asc`, { method: "GET" })),
      ]);
      setProducts(prodRows.map(productFromDB));
      setMovements(movRows.map(movementFromDB));
      setAsunciones(asuncionesRows[0] ? asuncionesFromDB(asuncionesRows[0]) : { cifPct: 0.03, margenMayoristaPct: 0.4, margenDetalPct: 0.6, ivaPct: 0.19 });
      const mastersDict = {};
      masterRows.forEach(r => { mastersDict[r.master_code] = masterFromDB(r); });
      setMasters(mastersDict);
      const keys = Object.keys(CATALOG_TABLES);
      const newCatalogs = {};
      keys.forEach((k, i) => { newCatalogs[k] = catRows[i].map(catFromDB); });
      setCatalogs(newCatalogs);
    } catch (e) {
      setError(e.message || "No se pudo conectar con la base de datos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  const filtered = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = (p.sku + p.name).toLowerCase().includes(search.toLowerCase());
      const matchesFilter = filter === "all" || (filter === "low" && p.stock < p.minStock);
      return matchesSearch && matchesFilter;
    });
  }, [products, search, filter]);

  async function updateAsunciones(next) {
    try {
      await sb(`mopa_asunciones?id=eq.1`, {
        method: "PATCH",
        body: JSON.stringify({
          cif_pct: next.cifPct, margen_mayorista_pct: next.margenMayoristaPct,
          margen_detal_pct: next.margenDetalPct, iva_pct: next.ivaPct,
        }),
      });
      setAsunciones(next);
    } catch (e) {
      alert("No se pudo actualizar la configuración de costeo: " + e.message);
    }
  }

  function onMasterUpdated(masterCode, masterData) {
    setMasters(prev => ({ ...prev, [masterCode]: masterData }));
  }

  const kpis = useMemo(() => {
    const totalUnits = products.reduce((a, p) => a + p.stock, 0);
    const totalValue = products.reduce((a, p) => a + p.stock * (masters[p.masterCode]?.costoTotal || 0), 0);
    const lowStock = products.filter(p => p.stock < p.minStock).length;
    return { skus: products.length, totalUnits, totalValue, lowStock };
  }, [products, masters]);

  function nextConsecutivo(codCategoria, codSegmento, codLinea, codDiseno) {
    const family = products.filter(p =>
      p.codCategoria === codCategoria && p.codSegmento === codSegmento &&
      p.codLinea === codLinea && p.codDiseno === codDiseno
    );
    if (family.length === 0) return "01";
    const max = Math.max(0, ...family.map(p => parseInt(p.consecutivo, 10) || 0));
    return pad2(max + 1);
  }

  async function addProduct(data) {
    const masterCode = `${data.codCategoria}-${data.codSegmento}-${data.codLinea}-${data.codDiseno}-${data.consecutivo}`;
    const sku = `${masterCode}-${data.codColor}-${data.codTalla}`;
    if (products.some(p => p.sku === sku)) {
      alert(`El SKU ${sku} ya existe. Cambia el color, talla o consecutivo.`);
      return;
    }
    const catNombre = catalogs.categorias.find(c => c.cod === data.codCategoria)?.nombre || "";
    const colorNombre = catalogs.colores.find(c => c.cod === data.codColor)?.nombre || "";
    const disenoNombre = catalogs.disenos.find(c => c.cod === data.codDiseno)?.nombre || "";
    try {
      const [row] = await sb("products", {
        method: "POST",
        body: JSON.stringify({
          sku, name: data.name, category: catNombre, color: colorNombre, diseno: disenoNombre,
          unit: "pza", min_stock: data.minStock, stock: 0,
          cod_categoria: data.codCategoria, cod_segmento: data.codSegmento, cod_linea: data.codLinea,
          cod_diseno: data.codDiseno, consecutivo: data.consecutivo, cod_color: data.codColor,
          cod_talla: data.codTalla, master_code: masterCode,
        }),
      });
      setProducts(prev => [...prev, productFromDB(row)]);
      setShowAddProduct(false);
    } catch (e) {
      alert("No se pudo guardar el producto: " + e.message);
    }
  }

  async function addMovement(product, type, qty, reason) {
    const delta = type === "entrada" ? qty : -qty;
    const newStock = Math.max(0, product.stock + delta);
    try {
      await sb(`products?id=eq.${product.id}`, { method: "PATCH", body: JSON.stringify({ stock: newStock }) });
      const [row] = await sb("movements", {
        method: "POST",
        body: JSON.stringify({ product_id: product.id, sku: product.sku, type, qty, reason, date: todayISO() }),
      });
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, stock: newStock } : p));
      setMovements(prev => [movementFromDB(row), ...prev]);
      setMovementFor(null);
    } catch (e) {
      alert("No se pudo registrar el movimiento: " + e.message);
    }
  }

  async function addCatalogItem(catalogKey, item) {
    const table = CATALOG_TABLES[catalogKey];
    try {
      const [row] = await sb(table, {
        method: "POST",
        body: JSON.stringify({
          cod: item.cod.toUpperCase().trim(), nombre: item.nombre.trim(),
          tipo: catalogKey === "tallas" ? item.tipo : undefined,
          orden: (catalogs[catalogKey].length || 0) + 1,
        }),
      });
      setCatalogs(prev => ({ ...prev, [catalogKey]: [...prev[catalogKey], catFromDB(row)] }));
    } catch (e) {
      alert("No se pudo agregar el ítem: " + e.message + "\n(¿Ya existe ese código?)");
    }
  }

  async function deleteCatalogItem(catalogKey, cod) {
    const table = CATALOG_TABLES[catalogKey];
    try {
      await sb(`${table}?cod=eq.${encodeURIComponent(cod)}`, { method: "DELETE" });
      setCatalogs(prev => ({ ...prev, [catalogKey]: prev[catalogKey].filter(i => i.cod !== cod) }));
    } catch (e) {
      alert("No se pudo eliminar: " + e.message);
    }
  }

  const productMovements = (productId) => movements.filter(m => m.productId === productId);

  return (
    <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: TOKENS.bg, color: TOKENS.ink, minHeight: "100%", display: "flex", fontSize: 14 }}>
      <style>{FONT_IMPORT}{`.spin { animation: spin 0.8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ width: 200, background: TOKENS.panel, borderRight: `1px solid ${TOKENS.border}`, padding: "20px 14px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28, paddingLeft: 4 }}>
          <div style={{ width: 26, height: 26, background: TOKENS.ink, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Boxes size={15} color={TOKENS.bg} />
          </div>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 15 }}>MOPA</span>
        </div>
        <NavItem icon={<Package size={16} />} label="Inventario" active />
        <NavItem icon={<ArrowUpCircle size={16} />} label="Producción" disabled />
        <NavItem icon={<ArrowDownCircle size={16} />} label="Compras" disabled />
        <NavItem icon={<CircleDollarSign size={16} />} label="Ventas" disabled />
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${TOKENS.border}` }}>
          <NavItem icon={<Settings2 size={16} />} label="Catálogos" onClick={() => setCatalogModalTab("categorias")} />
          <NavItem icon={<Sliders size={16} />} label="Costeo" onClick={() => setShowAsunciones(true)} />
        </div>
      </div>

      <div style={{ flex: 1, padding: "24px 32px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
          <div>
            <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 21, fontWeight: 700, margin: 0 }}>Inventario · Producto terminado</h1>
            <p style={{ color: TOKENS.inkSoft, fontSize: 13, margin: "4px 0 0" }}>Control de existencias por SKU estructurado</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {loading && <span style={{ display: "flex", alignItems: "center", gap: 6, color: TOKENS.inkSoft, fontSize: 12.5 }}><Loader2 size={14} className="spin" /> Cargando...</span>}
            <button onClick={() => setShowAddProduct(true)} style={btnPrimary}>
              <Plus size={15} /> Nuevo producto
            </button>
          </div>
        </div>

        {error && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: TOKENS.critSoft, color: TOKENS.crit, padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
            <WifiOff size={16} />
            <div>No se pudo conectar con la base de datos. <button onClick={loadAll} style={{ textDecoration: "underline", background: "none", border: "none", color: TOKENS.crit, cursor: "pointer", fontWeight: 600, padding: 0 }}>Reintentar</button></div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 22 }}>
          <KpiCard label="SKUs activos" value={kpis.skus} icon={<Package size={16} />} />
          <KpiCard label="Unidades en stock" value={kpis.totalUnits.toLocaleString("es-MX")} icon={<Boxes size={16} />} />
          <KpiCard label="Valor de inventario" value={fmtMoney(kpis.totalValue)} icon={<CircleDollarSign size={16} />} />
          <KpiCard label="Alertas de stock bajo" value={kpis.lowStock} icon={<TriangleAlert size={16} />} tone={kpis.lowStock > 0 ? "crit" : "good"} />
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <div style={{ position: "relative", flex: 1, maxWidth: 320 }}>
            <Search size={15} style={{ position: "absolute", left: 10, top: 10, color: TOKENS.inkSoft }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por SKU o nombre..."
              style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px 8px 32px", borderRadius: 7, border: `1px solid ${TOKENS.border}`, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
          </div>
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>Todos</FilterChip>
          <FilterChip active={filter === "low"} onClick={() => setFilter("low")}>Stock bajo</FilterChip>
        </div>

        <div style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.border}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "170px 1fr 120px 140px 100px 140px", padding: "10px 16px", borderBottom: `1px solid ${TOKENS.border}`, fontSize: 11, fontWeight: 600, color: TOKENS.inkSoft, letterSpacing: 0.4, textTransform: "uppercase" }}>
            <div>SKU</div><div>Producto</div><div>Categoría</div><div>Stock / mín.</div><div>Precio detal</div><div>Acciones</div>
          </div>
          {!loading && filtered.length === 0 && (
            <div style={{ padding: 32, textAlign: "center", color: TOKENS.inkSoft, fontSize: 13 }}>
              No hay productos todavía. Crea el primero con "Nuevo producto".
            </div>
          )}
          {filtered.map(p => {
            const isLow = p.stock < p.minStock;
            const master = masters[p.masterCode] || EMPTY_MASTER;
            return (
              <div key={p.id} style={{ display: "grid", gridTemplateColumns: "170px 1fr 120px 140px 100px 140px", padding: "12px 16px", borderBottom: `1px solid ${TOKENS.border}`, alignItems: "center" }}>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, fontWeight: 600 }}>{p.sku}</div>
                <div>
                  <div style={{ fontWeight: 500 }}>{p.name}</div>
                  {isLow && <div style={{ marginTop: 3 }}><Badge tone="crit">bajo mínimo</Badge></div>}
                </div>
                <div style={{ color: TOKENS.inkSoft, fontSize: 13 }}>{p.category}</div>
                <StockGauge stock={p.stock} min={p.minStock} />
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5 }}>{master.precioDetal > 0 ? fmtMoney(master.precioDetal) : "—"}</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setMovementFor(p)} title="Registrar movimiento" style={iconBtn}><ArrowUpCircle size={15} /></button>
                  <button onClick={() => setSelected(p)} title="Ver historial" style={iconBtn}><History size={15} /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selected && (
        <DetailDrawer product={selected} movements={productMovements(selected.id)} onClose={() => setSelected(null)}
          asunciones={asunciones} masterData={masters[selected.masterCode] || EMPTY_MASTER} onMasterUpdated={onMasterUpdated}
          variantCount={products.filter(p => p.masterCode === selected.masterCode).length} />
      )}
      {showAddProduct && (
        <AddProductModal
          catalogs={catalogs}
          onClose={() => setShowAddProduct(false)}
          onSave={addProduct}
          suggestConsecutivo={nextConsecutivo}
          onOpenCatalog={(key) => setCatalogModalTab(key)}
        />
      )}
      {movementFor && <MovementModal product={movementFor} onClose={() => setMovementFor(null)} onSave={addMovement} />}
      {catalogModalTab && (
        <CatalogsModal
          catalogs={catalogs}
          activeTab={catalogModalTab}
          setActiveTab={setCatalogModalTab}
          onAdd={addCatalogItem}
          onDelete={deleteCatalogItem}
          onClose={() => setCatalogModalTab(null)}
        />
      )}
      {showAsunciones && asunciones && (
        <AsuncionesModal asunciones={asunciones} onSave={updateAsunciones} onClose={() => setShowAsunciones(false)} />
      )}
    </div>
  );
}

function NavItem({ icon, label, active, disabled, onClick }) {
  return (
    <div onClick={disabled ? undefined : onClick} style={{
      display: "flex", alignItems: "center", gap: 9, padding: "9px 10px", borderRadius: 7, marginBottom: 3,
      background: active ? TOKENS.amberSoft : "transparent",
      color: disabled ? "#B7BEC7" : active ? TOKENS.ink : TOKENS.inkSoft,
      fontWeight: active ? 600 : 500, fontSize: 13, cursor: disabled ? "default" : "pointer",
    }}>
      {icon} {label}
      {disabled && <span style={{ marginLeft: "auto", fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", color: "#B7BEC7" }}>pronto</span>}
    </div>
  );
}

function KpiCard({ label, value, icon, tone }) {
  const fg = tone === "crit" ? TOKENS.crit : TOKENS.ink;
  return (
    <div style={{ background: TOKENS.panel, border: `1px solid ${TOKENS.border}`, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: TOKENS.inkSoft, fontSize: 12, marginBottom: 8 }}>{icon} {label}</div>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 700, color: fg }}>{value}</div>
    </div>
  );
}

function FilterChip({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: "7px 14px", borderRadius: 7, border: `1px solid ${active ? TOKENS.ink : TOKENS.border}`,
      background: active ? TOKENS.ink : TOKENS.panel, color: active ? TOKENS.bg : TOKENS.inkSoft,
      fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
    }}>{children}</button>
  );
}

const btnPrimary = {
  display: "flex", alignItems: "center", gap: 6, background: TOKENS.ink, color: TOKENS.bg,
  border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
};
const iconBtn = {
  width: 30, height: 30, borderRadius: 7, border: `1px solid ${TOKENS.border}`, background: TOKENS.panel,
  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: TOKENS.inkSoft,
};

function Overlay({ children, onClose, width = 380 }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(27,36,48,0.35)", display: "flex", justifyContent: "flex-end", zIndex: 50 }}>
      <div onClick={e => e.stopPropagation()} style={{ width, maxWidth: "90vw", background: TOKENS.panel, height: "100%", boxShadow: "-8px 0 24px rgba(0,0,0,0.12)", overflowY: "auto" }}>
        {children}
      </div>
    </div>
  );
}

function ModalCenter({ children, onClose, width = 380 }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(27,36,48,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div onClick={e => e.stopPropagation()} style={{ width, maxWidth: "92vw", maxHeight: "88vh", overflowY: "auto", background: TOKENS.panel, borderRadius: 12, boxShadow: "0 12px 32px rgba(0,0,0,0.18)" }}>
        {children}
      </div>
    </div>
  );
}

function DetailDrawer({ product, movements, onClose, asunciones, masterData, onMasterUpdated, variantCount }) {
  const [tab, setTab] = useState("movimientos");
  return (
    <Overlay onClose={onClose} width={440}>
      <div style={{ padding: 20, fontFamily: "'IBM Plex Sans', sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: TOKENS.inkSoft }}>{product.sku}</div>
          <button onClick={onClose} style={{ ...iconBtn, border: "none" }}><X size={16} /></button>
        </div>
        <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 17, margin: "2px 0 10px" }}>{product.name}</h2>
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          <span style={tagStyle}>Código maestro: {product.masterCode}</span>
          {product.color && <span style={tagStyle}>Color: {product.color}</span>}
          {product.codTalla && <span style={tagStyle}>Talla: {product.codTalla}</span>}
          {product.diseno && <span style={tagStyle}>Diseño: {product.diseno}</span>}
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1, background: TOKENS.bg, borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 11, color: TOKENS.inkSoft, marginBottom: 4 }}>Stock actual</div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 18 }}>{product.stock}</div>
          </div>
          <div style={{ flex: 1, background: TOKENS.bg, borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 11, color: TOKENS.inkSoft, marginBottom: 4 }}>Mínimo</div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 18 }}>{product.minStock}</div>
          </div>
          <div style={{ flex: 1, background: TOKENS.bg, borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 11, color: TOKENS.inkSoft, marginBottom: 4 }}>Precio detal</div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 15 }}>{masterData.precioDetal > 0 ? fmtMoney(masterData.precioDetal) : "—"}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 16, borderBottom: `1px solid ${TOKENS.border}` }}>
          <TabBtn active={tab === "movimientos"} onClick={() => setTab("movimientos")} icon={<History size={14} />}>Movimientos</TabBtn>
          <TabBtn active={tab === "costeo"} onClick={() => setTab("costeo")} icon={<Calculator size={14} />}>Costeo y precio</TabBtn>
        </div>

        {tab === "movimientos" && (
          <>
            {movements.length === 0 && <div style={{ color: TOKENS.inkSoft, fontSize: 13 }}>Sin movimientos registrados aún.</div>}
            {movements.map(m => (
              <div key={m.id} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: `1px solid ${TOKENS.border}` }}>
                {m.type === "entrada"
                  ? <ArrowUpCircle size={17} color={TOKENS.good} style={{ flexShrink: 0, marginTop: 1 }} />
                  : <ArrowDownCircle size={17} color={TOKENS.crit} style={{ flexShrink: 0, marginTop: 1 }} />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{m.reason}</div>
                  <div style={{ fontSize: 11.5, color: TOKENS.inkSoft, marginTop: 2 }}>{fmtDate(m.date)}</div>
                </div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 600, color: m.type === "entrada" ? TOKENS.good : TOKENS.crit }}>
                  {m.type === "entrada" ? "+" : "−"}{m.qty}
                </div>
              </div>
            ))}
          </>
        )}

        {tab === "costeo" && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: TOKENS.amberSoft, color: TOKENS.ink, fontSize: 11.5, padding: "8px 10px", borderRadius: 7, marginBottom: 14 }}>
              <Calculator size={13} style={{ flexShrink: 0 }} />
              Este costeo aplica al código maestro <strong>&nbsp;{product.masterCode}&nbsp;</strong> — se comparte con las {variantCount} variante{variantCount === 1 ? "" : "s"} de color/talla de este mismo diseño.
            </div>
            <CostingPanel masterCode={product.masterCode} masterData={masterData} asunciones={asunciones} onMasterUpdated={onMasterUpdated} />
          </>
        )}
      </div>
    </Overlay>
  );
}

const tagStyle = { background: TOKENS.bg, color: TOKENS.inkSoft, fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 4 };

function TabBtn({ active, onClick, icon, children }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 6, padding: "8px 4px", marginBottom: -1,
      background: "none", border: "none", borderBottom: `2px solid ${active ? TOKENS.ink : "transparent"}`,
      color: active ? TOKENS.ink : TOKENS.inkSoft, fontWeight: 600, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit",
    }}>{icon} {children}</button>
  );
}

function LineItemRow({ item, fields, onDelete }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${TOKENS.border}`, fontSize: 12.5 }}>
      {fields.map((f, i) => (
        <div key={i} style={{ flex: f.flex || 1, color: f.muted ? TOKENS.inkSoft : TOKENS.ink, fontFamily: f.mono ? "'IBM Plex Mono', monospace" : "inherit" }}>{f.value}</div>
      ))}
      <button onClick={onDelete} style={{ background: "none", border: "none", cursor: "pointer", color: TOKENS.inkSoft, flexShrink: 0 }}><Trash2 size={13} /></button>
    </div>
  );
}

function CostingPanel({ masterCode, masterData, asunciones, onMasterUpdated }) {
  const [materiales, setMateriales] = useState([]);
  const [manoObra, setManoObra] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [utilMay, setUtilMay] = useState(masterData.utilidadMayoristaPersonalizada);
  const [utilDet, setUtilDet] = useState(masterData.utilidadDetalPersonalizada);

  const [matForm, setMatForm] = useState({ detalle: "", proveedor: "", valorUnitario: "", cantidad: "1" });
  const [moForm, setMoForm] = useState({ area: "", detalle: "", valorUnitario: "", cantidad: "1" });

  async function load() {
    setLoading(true);
    try {
      const [matRows, moRows] = await Promise.all([
        sb(`product_materiales?master_code=eq.${encodeURIComponent(masterCode)}&select=*&order=created_at.asc`, { method: "GET" }),
        sb(`product_mano_obra?master_code=eq.${encodeURIComponent(masterCode)}&select=*&order=created_at.asc`, { method: "GET" }),
      ]);
      setMateriales(matRows.map(materialFromDB));
      setManoObra(moRows.map(manoObraFromDB));
    } catch (e) {
      alert("No se pudo cargar el costeo: " + e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [masterCode]);

  async function addMaterial() {
    if (!matForm.detalle.trim() || !matForm.valorUnitario) return;
    try {
      const [row] = await sb("product_materiales", {
        method: "POST",
        body: JSON.stringify({
          master_code: masterCode, detalle: matForm.detalle, proveedor: matForm.proveedor,
          valor_unitario: Number(matForm.valorUnitario), cantidad: Number(matForm.cantidad) || 1,
        }),
      });
      setMateriales(prev => [...prev, materialFromDB(row)]);
      setMatForm({ detalle: "", proveedor: "", valorUnitario: "", cantidad: "1" });
    } catch (e) { alert("No se pudo agregar: " + e.message); }
  }
  async function deleteMaterial(id) {
    try { await sb(`product_materiales?id=eq.${id}`, { method: "DELETE" }); setMateriales(prev => prev.filter(m => m.id !== id)); }
    catch (e) { alert("No se pudo eliminar: " + e.message); }
  }
  async function addManoObra() {
    if (!moForm.area.trim() || !moForm.valorUnitario) return;
    try {
      const [row] = await sb("product_mano_obra", {
        method: "POST",
        body: JSON.stringify({
          master_code: masterCode, area: moForm.area, detalle: moForm.detalle,
          valor_unitario: Number(moForm.valorUnitario), cantidad: Number(moForm.cantidad) || 1,
        }),
      });
      setManoObra(prev => [...prev, manoObraFromDB(row)]);
      setMoForm({ area: "", detalle: "", valorUnitario: "", cantidad: "1" });
    } catch (e) { alert("No se pudo agregar: " + e.message); }
  }
  async function deleteManoObra(id) {
    try { await sb(`product_mano_obra?id=eq.${id}`, { method: "DELETE" }); setManoObra(prev => prev.filter(m => m.id !== id)); }
    catch (e) { alert("No se pudo eliminar: " + e.message); }
  }

  const calc = calcularCosteo(materiales, manoObra, asunciones, utilMay, utilDet);

  async function guardarCosteo() {
    setSaving(true);
    try {
      const body = {
        costo_total: calc.costoTotal, precio_mayorista: calc.precioMayConIva, precio_detal: calc.precioDetConIva,
        utilidad_mayorista_personalizada: utilMay, utilidad_detal_personalizada: utilDet,
      };
      await saveMaster(masterCode, body);
      onMasterUpdated(masterCode, {
        costoTotal: calc.costoTotal, precioMayorista: calc.precioMayConIva, precioDetal: calc.precioDetConIva,
        utilidadMayoristaPersonalizada: utilMay, utilidadDetalPersonalizada: utilDet,
      });
    } catch (e) {
      alert("No se pudo guardar el costeo: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ padding: "20px 0", color: TOKENS.inkSoft, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}><Loader2 size={14} className="spin" /> Cargando costeo...</div>;

  return (
    <div>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: TOKENS.inkSoft, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>Materia prima</div>
      {materiales.map(m => (
        <LineItemRow key={m.id} onDelete={() => deleteMaterial(m.id)} fields={[
          { value: m.detalle, flex: 2 },
          { value: m.proveedor || "—", flex: 1, muted: true },
          { value: `${m.cantidad} × ${fmtMoney(m.valorUnitario)}`, flex: 1.2, mono: true, muted: true },
          { value: fmtMoney(m.valorUnitario * m.cantidad), flex: 1, mono: true },
        ]} />
      ))}
      {materiales.length === 0 && <div style={{ fontSize: 12.5, color: TOKENS.inkSoft, padding: "6px 0" }}>Sin insumos agregados.</div>}
      <div style={{ display: "flex", gap: 6, marginTop: 8, marginBottom: 18, flexWrap: "wrap" }}>
        <input style={{ ...miniInput, flex: 2 }} placeholder="Insumo (ej. Tela cuerpo)" value={matForm.detalle} onChange={e => setMatForm(f => ({ ...f, detalle: e.target.value }))} />
        <input style={{ ...miniInput, flex: 1 }} placeholder="Proveedor" value={matForm.proveedor} onChange={e => setMatForm(f => ({ ...f, proveedor: e.target.value }))} />
        <input style={{ ...miniInput, flex: "0 0 70px" }} type="number" placeholder="Cant." value={matForm.cantidad} onChange={e => setMatForm(f => ({ ...f, cantidad: e.target.value }))} />
        <input style={{ ...miniInput, flex: "0 0 90px" }} type="number" placeholder="V. unit." value={matForm.valorUnitario} onChange={e => setMatForm(f => ({ ...f, valorUnitario: e.target.value }))} />
        <button onClick={addMaterial} style={{ ...iconBtn, background: TOKENS.ink, color: TOKENS.bg, border: "none" }}><Plus size={14} /></button>
      </div>

      <div style={{ fontSize: 11.5, fontWeight: 600, color: TOKENS.inkSoft, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>Mano de obra</div>
      {manoObra.map(m => (
        <LineItemRow key={m.id} onDelete={() => deleteManoObra(m.id)} fields={[
          { value: m.area, flex: 1, muted: true },
          { value: m.detalle || "—", flex: 1.5 },
          { value: `${m.cantidad} × ${fmtMoney(m.valorUnitario)}`, flex: 1.2, mono: true, muted: true },
          { value: fmtMoney(m.valorUnitario * m.cantidad), flex: 1, mono: true },
        ]} />
      ))}
      {manoObra.length === 0 && <div style={{ fontSize: 12.5, color: TOKENS.inkSoft, padding: "6px 0" }}>Sin actividades agregadas.</div>}
      <div style={{ display: "flex", gap: 6, marginTop: 8, marginBottom: 18, flexWrap: "wrap" }}>
        <input style={{ ...miniInput, flex: 1 }} placeholder="Área (ej. Corte)" value={moForm.area} onChange={e => setMoForm(f => ({ ...f, area: e.target.value }))} />
        <input style={{ ...miniInput, flex: 1.3 }} placeholder="Detalle" value={moForm.detalle} onChange={e => setMoForm(f => ({ ...f, detalle: e.target.value }))} />
        <input style={{ ...miniInput, flex: "0 0 70px" }} type="number" placeholder="Cant." value={moForm.cantidad} onChange={e => setMoForm(f => ({ ...f, cantidad: e.target.value }))} />
        <input style={{ ...miniInput, flex: "0 0 90px" }} type="number" placeholder="V. unit." value={moForm.valorUnitario} onChange={e => setMoForm(f => ({ ...f, valorUnitario: e.target.value }))} />
        <button onClick={addManoObra} style={{ ...iconBtn, background: TOKENS.ink, color: TOKENS.bg, border: "none" }}><Plus size={14} /></button>
      </div>

      <div style={{ background: TOKENS.bg, borderRadius: 8, padding: 14, marginBottom: 14 }}>
        <BreakdownRow label="Materia prima" value={calc.materiaPrimaTotal} />
        <BreakdownRow label="Mano de obra" value={calc.manoObraTotal} />
        <BreakdownRow label="Costo directo" value={calc.costoDirecto} />
        <BreakdownRow label={`CIF (${(asunciones.cifPct * 100).toFixed(1)}%)`} value={calc.cif} />
        <BreakdownRow label="Costo total" value={calc.costoTotal} bold />
      </div>

      <PriceBlock
        label="Precio mayorista" muted={`sugerida ${(asunciones.margenMayoristaPct * 100).toFixed(0)}% margen`}
        utilidad={utilMay} sugerida={calc.utilidadMaySugerida} onChangeUtilidad={setUtilMay}
        sinIva={calc.precioMaySinIva} conIva={calc.precioMayConIva} ivaPct={asunciones.ivaPct}
      />
      <PriceBlock
        label="Precio al detal" muted={`sugerida ${(asunciones.margenDetalPct * 100).toFixed(0)}% margen`}
        utilidad={utilDet} sugerida={calc.utilidadDetSugerida} onChangeUtilidad={setUtilDet}
        sinIva={calc.precioDetSinIva} conIva={calc.precioDetConIva} ivaPct={asunciones.ivaPct}
      />

      <button onClick={guardarCosteo} disabled={saving} style={{ ...btnPrimary, width: "100%", justifyContent: "center", opacity: saving ? 0.6 : 1 }}>
        {saving ? <Loader2 size={14} className="spin" /> : <Calculator size={15} />} Guardar costeo
      </button>
    </div>
  );
}

function BreakdownRow({ label, value, bold }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: bold ? 13.5 : 12.5, fontWeight: bold ? 700 : 400 }}>
      <span style={{ color: bold ? TOKENS.ink : TOKENS.inkSoft }}>{label}</span>
      <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{fmtMoney(value)}</span>
    </div>
  );
}

function PriceBlock({ label, muted, utilidad, sugerida, onChangeUtilidad, sinIva, conIva, ivaPct }) {
  const value = utilidad != null ? utilidad : sugerida;
  return (
    <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 8, padding: 12, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 10.5, color: TOKENS.inkSoft }}>{muted}</span>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 11.5, color: TOKENS.inkSoft, flexShrink: 0 }}>Utilidad</span>
        <input type="number" style={{ ...miniInput, flex: 1 }} value={Math.round(value)} onChange={e => onChangeUtilidad(e.target.value === "" ? null : Number(e.target.value))} />
        <button onClick={() => onChangeUtilidad(null)} title="Usar sugerida" style={{ fontSize: 10.5, color: TOKENS.amber, background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}>usar sugerida</button>
      </div>
      <BreakdownRow label="Precio sin IVA" value={sinIva} />
      <BreakdownRow label={`IVA (${(ivaPct * 100).toFixed(0)}%)`} value={conIva - sinIva} />
      <BreakdownRow label="Precio con IVA" value={conIva} bold />
    </div>
  );
}

function AsuncionesModal({ asunciones, onSave, onClose }) {
  const [form, setForm] = useState({ ...asunciones });
  const pct = (key) => ({
    value: Math.round(form[key] * 100),
    onChange: (e) => setForm(f => ({ ...f, [key]: Number(e.target.value) / 100 })),
  });
  return (
    <ModalCenter onClose={onClose} width={380}>
      <div style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, margin: 0 }}>Configuración de costeo</h3>
          <button onClick={onClose} style={{ ...iconBtn, border: "none" }}><X size={16} /></button>
        </div>
        <p style={{ fontSize: 12, color: TOKENS.inkSoft, margin: "2px 0 16px" }}>Estos valores aplican como sugerencia a todos los SKU. Puedes personalizar la utilidad por producto en su costeo individual.</p>
        <Field label="CIF — costos indirectos (% sobre costo directo)"><input type="number" style={input} {...pct("cifPct")} /></Field>
        <Field label="Margen mayorista sugerido (% sobre precio)"><input type="number" style={input} {...pct("margenMayoristaPct")} /></Field>
        <Field label="Margen detal sugerido (% sobre precio)"><input type="number" style={input} {...pct("margenDetalPct")} /></Field>
        <Field label="IVA (%)"><input type="number" style={input} {...pct("ivaPct")} /></Field>
        <button onClick={() => { onSave(form); onClose(); }} style={{ ...btnPrimary, width: "100%", justifyContent: "center", marginTop: 6 }}>Guardar configuración</button>
      </div>
    </ModalCenter>
  );
}

const miniInput = {
  boxSizing: "border-box", padding: "6px 8px", borderRadius: 6, border: `1px solid ${TOKENS.border}`,
  fontSize: 12, fontFamily: "inherit", outline: "none", background: TOKENS.panel, minWidth: 0,
};

function SkuSelect({ label, options, value, onChange, onAddNew }) {
  return (
    <div style={{ marginBottom: 12, flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: TOKENS.inkSoft }}>{label}</span>
        <button type="button" onClick={onAddNew} title={`Agregar ${label.toLowerCase()}`} style={{ background: "none", border: "none", color: TOKENS.amber, cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}>
          <Plus size={13} />
        </button>
      </div>
      <select style={input} value={value} onChange={e => onChange(e.target.value)}>
        <option value="">Selecciona...</option>
        {options.map(o => <option key={o.cod} value={o.cod}>{o.cod} — {o.nombre}</option>)}
      </select>
    </div>
  );
}

function AddProductModal({ catalogs, onClose, onSave, suggestConsecutivo, onOpenCatalog }) {
  const [codCategoria, setCodCategoria] = useState("");
  const [codSegmento, setCodSegmento] = useState("");
  const [codLinea, setCodLinea] = useState("");
  const [codDiseno, setCodDiseno] = useState("");
  const [consecutivo, setConsecutivo] = useState("");
  const [codColor, setCodColor] = useState("");
  const [codTalla, setCodTalla] = useState("");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [minStock, setMinStock] = useState(20);

  const catNombre = catalogs.categorias.find(c => c.cod === codCategoria)?.nombre || "";
  const segNombre = catalogs.segmentos.find(c => c.cod === codSegmento)?.nombre || "";
  const linNombre = catalogs.lineas.find(c => c.cod === codLinea)?.nombre || "";
  const disNombre = catalogs.disenos.find(c => c.cod === codDiseno)?.nombre || "";
  const colNombre = catalogs.colores.find(c => c.cod === codColor)?.nombre || "";

  useEffect(() => {
    if (codCategoria && codSegmento && codLinea && codDiseno) {
      setConsecutivo(suggestConsecutivo(codCategoria, codSegmento, codLinea, codDiseno));
    }
  }, [codCategoria, codSegmento, codLinea, codDiseno]);

  useEffect(() => {
    if (!nameTouched && catNombre && segNombre && linNombre) {
      const disPart = disNombre && disNombre !== "No aplica" ? ` ${disNombre}` : "";
      setName(`${catNombre} ${segNombre} ${linNombre}${disPart}`.trim());
    }
  }, [catNombre, segNombre, linNombre, disNombre, nameTouched]);

  const consecPadded = consecutivo ? pad2(consecutivo) : "";
  const masterCode = codCategoria && codSegmento && codLinea && codDiseno && consecPadded
    ? `${codCategoria}-${codSegmento}-${codLinea}-${codDiseno}-${consecPadded}` : "";
  const skuPreview = masterCode && codColor && codTalla ? `${masterCode}-${codColor}-${codTalla}` : "";

  const canSave = codCategoria && codSegmento && codLinea && codDiseno && consecPadded && codColor && codTalla && name.trim();

  return (
    <ModalCenter onClose={onClose} width={460}>
      <div style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, margin: 0 }}>Nuevo producto</h3>
          <button onClick={onClose} style={{ ...iconBtn, border: "none" }}><X size={16} /></button>
        </div>
        <p style={{ fontSize: 12, color: TOKENS.inkSoft, margin: "2px 0 14px" }}>El SKU se arma solo a partir de la estructura. Usa el <Plus size={10} style={{ display: "inline", verticalAlign: -1 }} /> junto a cada campo para agregar ítems nuevos al catálogo.</p>

        <div style={{ display: "flex", gap: 10 }}>
          <SkuSelect label="Categoría" options={catalogs.categorias} value={codCategoria} onChange={setCodCategoria} onAddNew={() => onOpenCatalog("categorias")} />
          <SkuSelect label="Segmento" options={catalogs.segmentos} value={codSegmento} onChange={setCodSegmento} onAddNew={() => onOpenCatalog("segmentos")} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <SkuSelect label="Línea" options={catalogs.lineas} value={codLinea} onChange={setCodLinea} onAddNew={() => onOpenCatalog("lineas")} />
          <SkuSelect label="Diseño" options={catalogs.disenos} value={codDiseno} onChange={setCodDiseno} onAddNew={() => onOpenCatalog("disenos")} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Field label="Consecutivo (2 dígitos, auto)">
            <input style={input} value={consecutivo} onChange={e => setConsecutivo(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="01" />
          </Field>
          <div style={{ flex: 1 }} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <SkuSelect label="Color" options={catalogs.colores} value={codColor} onChange={setCodColor} onAddNew={() => onOpenCatalog("colores")} />
          <SkuSelect label="Talla" options={catalogs.tallas} value={codTalla} onChange={setCodTalla} onAddNew={() => onOpenCatalog("tallas")} />
        </div>

        <Field label="Descripción">
          <input style={input} value={name} onChange={e => { setName(e.target.value); setNameTouched(true); }} placeholder="Se sugiere automáticamente" />
        </Field>

        <div style={{ display: "flex", gap: 10 }}>
          <Field label="Stock mínimo"><input type="number" style={input} value={minStock} onChange={e => setMinStock(e.target.value)} /></Field>
        </div>
        <p style={{ fontSize: 11.5, color: TOKENS.inkSoft, margin: "-4px 0 12px" }}>El costo y precio se definen después, en la pestaña "Costeo y precio" del producto.</p>

        {(masterCode || skuPreview) && (
          <div style={{ background: TOKENS.bg, borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
            <div style={{ fontSize: 10.5, color: TOKENS.inkSoft, marginBottom: 2 }}>SKU FINAL</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: 700 }}>
              {skuPreview || masterCode + "-..."}
            </div>
          </div>
        )}

        <button
          disabled={!canSave}
          onClick={() => onSave({ codCategoria, codSegmento, codLinea, codDiseno, consecutivo: consecPadded, codColor, codTalla, name, minStock: Number(minStock) })}
          style={{ ...btnPrimary, width: "100%", justifyContent: "center", marginTop: 6, opacity: canSave ? 1 : 0.4 }}
        >Guardar producto</button>
      </div>
    </ModalCenter>
  );
}

function CatalogsModal({ catalogs, activeTab, setActiveTab, onAdd, onDelete, onClose }) {
  const [cod, setCod] = useState("");
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("Alfa");
  const keys = Object.keys(CATALOG_LABELS);
  const items = catalogs[activeTab] || [];

  function submit() {
    if (!cod.trim() || !nombre.trim()) return;
    onAdd(activeTab, { cod, nombre, tipo });
    setCod(""); setNombre("");
  }

  return (
    <ModalCenter onClose={onClose} width={480}>
      <div style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, margin: 0 }}>Catálogos del SKU</h3>
          <button onClick={onClose} style={{ ...iconBtn, border: "none" }}><X size={16} /></button>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
          {keys.map(k => (
            <button key={k} onClick={() => setActiveTab(k)} style={{
              padding: "6px 11px", borderRadius: 6, border: `1px solid ${activeTab === k ? TOKENS.ink : TOKENS.border}`,
              background: activeTab === k ? TOKENS.ink : TOKENS.panel, color: activeTab === k ? TOKENS.bg : TOKENS.inkSoft,
              fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}>{CATALOG_LABELS[k]}</button>
          ))}
        </div>

        <div style={{ border: `1px solid ${TOKENS.border}`, borderRadius: 8, marginBottom: 14, maxHeight: 220, overflowY: "auto" }}>
          {items.length === 0 && <div style={{ padding: 14, fontSize: 13, color: TOKENS.inkSoft }}>Sin ítems todavía.</div>}
          {items.map(i => (
            <div key={i.cod} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderBottom: `1px solid ${TOKENS.border}` }}>
              <div style={{ fontSize: 13 }}>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{i.cod}</span>
                <span style={{ color: TOKENS.inkSoft }}> — {i.nombre}{i.tipo ? ` (${i.tipo})` : ""}</span>
              </div>
              <button onClick={() => onDelete(activeTab, i.cod)} style={{ background: "none", border: "none", cursor: "pointer", color: TOKENS.inkSoft }}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 11.5, fontWeight: 600, color: TOKENS.inkSoft, marginBottom: 8 }}>Agregar nuevo ítem a {CATALOG_LABELS[activeTab].toLowerCase()}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={{ ...input, flex: "0 0 90px" }} placeholder="Código" value={cod} onChange={e => setCod(e.target.value)} />
          <input style={{ ...input, flex: 1 }} placeholder="Nombre" value={nombre} onChange={e => setNombre(e.target.value)} />
          {activeTab === "tallas" && (
            <select style={{ ...input, flex: "0 0 130px" }} value={tipo} onChange={e => setTipo(e.target.value)}>
              <option>Alfa</option>
              <option>Numérica adulto</option>
              <option>Numérica infantil</option>
              <option>Única</option>
            </select>
          )}
        </div>
        <button onClick={submit} style={{ ...btnPrimary, width: "100%", justifyContent: "center", marginTop: 10 }}>
          <Plus size={15} /> Agregar
        </button>
      </div>
    </ModalCenter>
  );
}

function MovementModal({ product, onClose, onSave }) {
  const [type, setType] = useState("entrada");
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState("");
  return (
    <ModalCenter onClose={onClose} width={380}>
      <div style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, margin: 0 }}>Registrar movimiento</h3>
          <button onClick={onClose} style={{ ...iconBtn, border: "none" }}><X size={16} /></button>
        </div>
        <div style={{ fontSize: 12.5, color: TOKENS.inkSoft, marginBottom: 16 }}>{product.sku} · {product.name}</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button onClick={() => setType("entrada")} style={{ ...toggleBtn, ...(type === "entrada" ? toggleActiveGood : {}) }}><ArrowUpCircle size={15} /> Entrada</button>
          <button onClick={() => setType("salida")} style={{ ...toggleBtn, ...(type === "salida" ? toggleActiveCrit : {}) }}><ArrowDownCircle size={15} /> Salida</button>
        </div>
        <Field label="Cantidad"><input type="number" min={1} style={input} value={qty} onChange={e => setQty(e.target.value)} /></Field>
        <Field label="Motivo"><input style={input} value={reason} onChange={e => setReason(e.target.value)} placeholder={type === "entrada" ? "Producción - orden #..." : "Venta - pedido #..."} /></Field>
        <button
          disabled={!qty || Number(qty) <= 0}
          onClick={() => onSave(product, type, Number(qty), reason || (type === "entrada" ? "Entrada de producción" : "Salida por venta"))}
          style={{ ...btnPrimary, width: "100%", justifyContent: "center", marginTop: 6, opacity: (!qty || Number(qty) <= 0) ? 0.4 : 1 }}
        >Registrar</button>
      </div>
    </ModalCenter>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12, flex: 1 }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: TOKENS.inkSoft, marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

const input = {
  width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 7,
  border: `1px solid ${TOKENS.border}`, fontSize: 13, fontFamily: "inherit", outline: "none", background: TOKENS.panel,
};
const toggleBtn = {
  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 0",
  borderRadius: 7, border: `1px solid ${TOKENS.border}`, background: TOKENS.panel, color: TOKENS.inkSoft,
  fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
};
const toggleActiveGood = { background: TOKENS.goodSoft, color: TOKENS.good, borderColor: TOKENS.good };
const toggleActiveCrit = { background: TOKENS.critSoft, color: TOKENS.crit, borderColor: TOKENS.crit };
