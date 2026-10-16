import { useEffect, useMemo, useRef, useState } from "react";
import { Download, PackagePlus, Pencil, Search, Trash2, Upload, X } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "./supabaseClient";
import "./ResinInventory.css";

const SHEET_URL = "";
const TABLE = "resin_inventory";
const STATUSES = ["Available", "Reserved", "Sold", "For Repair", "On Display", "Consigned"];
const DECLARATIONS = ["Brand-new", "Second hand", "Repaired"];
const FIELDS = [
  { key: "name", label: "Name", type: "text", db: "name" },
  { key: "genreSeries", label: "Genre/Series", type: "text", db: "genre_series" },
  { key: "quantity", label: "Quantity", type: "number", db: "quantity" },
  { key: "picture", label: "Picture URL", type: "url", db: "picture_url" },
  { key: "inventoryStatus", label: "Inventory Status", type: "select", db: "inventory_status" },
  { key: "boxNumber", label: "Box Number (Old Box/New Box)", type: "text", db: "box_number" },
  { key: "acquisitionPrice", label: "Acquisition Price", type: "number", db: "acquisition_price" },
  { key: "storePrice", label: "Store Price", type: "number", db: "store_price" },
  { key: "megaSalePrice", label: "Mega Sale Price", type: "number", db: "mega_sale_price" },
  { key: "megaSalePercentage", label: "Mega Sale Percentage", type: "number", db: "mega_sale_percentage" },
  { key: "sku", label: "SKU", type: "text", db: "sku" },
  { key: "boxConditions", label: "Box Conditions", type: "text", db: "box_conditions" },
  { key: "scale", label: "Scale", type: "text", db: "scale" },
  { key: "tokenNumber", label: "Token#", type: "text", db: "token_number" },
  { key: "cardNumber", label: "Card#", type: "text", db: "card_number" },
  { key: "certificates", label: "Certificates", type: "text", db: "certificates" },
  { key: "conditions", label: "Conditions", type: "text", db: "conditions" },
  { key: "inclusions", label: "Inclusions", type: "textarea", db: "inclusions" },
  { key: "declarations", label: "Declarations (Brand-new/Second hand/Repaired)", type: "declaration", db: "declarations" },
  { key: "issues", label: "Issues", type: "textarea", db: "issues" },
  { key: "tags", label: "Tags", type: "text", db: "tags" },
  { key: "dateReceived", label: "Date Received", type: "date", db: "date_received" },
  { key: "dateSold", label: "Date Sold", type: "date", db: "date_sold" },
  { key: "whoUnboxed", label: "Who Unboxed (Employee)", type: "text", db: "who_unboxed" },
  { key: "remarksOwner", label: "Remarks (Owner)", type: "textarea", db: "remarks_owner" },
  { key: "remarksEmployees", label: "Remarks (Employees/Manager)", type: "textarea", db: "remarks_employees" },
];
const ALIASES = {
  name: ["name", "itemname", "productname", "resinname"],
  genreSeries: ["genreseries", "genre", "series", "anime", "franchise"],
  quantity: ["quantity", "qty", "count"],
  picture: ["picture", "pictureurl", "image", "imageurl", "photo", "photourl"],
  inventoryStatus: ["inventorystatus", "status", "availability"],
  boxNumber: ["boxnumber", "box", "boxno", "oldboxnewbox"],
  acquisitionPrice: ["acquisitionprice", "cost", "costprice", "purchaseprice", "buyingprice"],
  storePrice: ["storeprice", "sellingprice", "retailprice", "price"],
  megaSalePrice: ["megasaleprice", "saleprice"],
  megaSalePercentage: ["megasalepercentage", "megasalepercent", "discountpercentage", "discount"],
  sku: ["sku", "itemcode", "productcode"],
  boxConditions: ["boxconditions", "boxcondition"],
  scale: ["scale", "figurescale"],
  tokenNumber: ["token", "tokennumber"],
  cardNumber: ["card", "cardnumber"],
  certificates: ["certificates", "certificate"],
  conditions: ["conditions", "itemcondition", "condition"],
  inclusions: ["inclusions", "includeditems"],
  declarations: ["declarations", "declaration", "itemtype"],
  issues: ["issues", "defects", "damage"],
  tags: ["tags", "tag"],
  dateReceived: ["datereceived", "receiveddate"],
  dateSold: ["datesold", "solddate"],
  whoUnboxed: ["whounboxed", "unboxedby", "employee"],
  remarksOwner: ["remarksowner", "ownerremarks", "ownerremark", "remarks"],
  remarksEmployees: ["remarksemployeesmanager", "employeesremarks", "managerremarks", "staffremarks"],
};
const EMPTY_FORM = Object.fromEntries(FIELDS.map(field => [field.key, field.key === "quantity" ? "1" : ""]));
const normalizeHeader = value => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const fromDb = row => Object.fromEntries([
  ["id", row.id],
  ...FIELDS.map(field => [field.key, row[field.db] == null ? "" : String(row[field.db])]),
]);
const toDb = values => Object.fromEntries(FIELDS.map(field => {
  let value = String(values[field.key] ?? "").trim();
  if (field.type === "number") value = value === "" ? null : Number(value);
  else if (field.type !== "date" && value === "") value = null;
  return [field.db, value];
}));
const money = value => value !== "" && value != null && Number.isFinite(Number(value))
  ? `₱${Number(value).toLocaleString("en-PH", { maximumFractionDigits: 2 })}` : "—";
const safeImageUrl = value => {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
};

function mapSheetRow(row) {
  const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]));
  const item = { ...EMPTY_FORM };
  FIELDS.forEach(field => {
    const aliases = ALIASES[field.key] || [normalizeHeader(field.key)];
    const raw = aliases.map(alias => normalized[alias]).find(value => value != null && String(value).trim() !== "");
    if (raw == null) return;
    if (field.type === "number") {
      const parsed = Number(String(raw).replace(/[₱,%\s,]/g, ""));
      item[field.key] = Number.isFinite(parsed) ? String(parsed) : "";
    } else {
      item[field.key] = String(raw).trim();
    }
  });
  if (!item.inventoryStatus) item.inventoryStatus = "Available";
  if (!item.quantity || Number(item.quantity) < 1) item.quantity = "1";
  return item;
}

export default function ResinInventory({ viewerEmp }) {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [sheetUrl, setSheetUrl] = useState(SHEET_URL);
  const [status, setStatus] = useState("Loading inventory…");
  const [statusType, setStatusType] = useState("");
  const [busy, setBusy] = useState(false);
  const [userId, setUserId] = useState(null);
  const didAutoFetch = useRef(false);
  const canManage = ["superadmin", "executive", "manager"].includes(viewerEmp?.role);

  const setMessage = (message, type = "") => {
    setStatus(message);
    setStatusType(type);
  };

  const loadInventory = async () => {
    setLoading(true);
    const [{ data, error }, { data: authData }] = await Promise.all([
      supabase.from(TABLE).select("*").order("created_at", { ascending: false }),
      supabase.auth.getSession(),
    ]);
    setLoading(false);
    if (error) {
      setMessage(`Could not load inventory: ${error.message}`, "error");
      return false;
    }
    setInventory((data || []).map(fromDb));
    setUserId(authData.session?.user?.id || null);
    setMessage(`${(data || []).length.toLocaleString()} inventory records loaded.`, "success");
    return true;
  };

  useEffect(() => { void loadInventory(); }, []);
  useEffect(() => {
    if (loading || !canManage || didAutoFetch.current) return;
    didAutoFetch.current = true;
    void fetchSheet(SHEET_URL, true);
  }, [loading, canManage]);
  useEffect(() => {
    if (!modalOpen) return undefined;
    const onKeyDown = event => { if (event.key === "Escape") setModalOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalOpen]);

  const shown = useMemo(() => {
    const query = search.trim().toLowerCase();
    return inventory.filter(item => {
      const matchesText = !query || FIELDS.map(field => item[field.key] ?? "").join(" ").toLowerCase().includes(query);
      return matchesText && (!filter || item.inventoryStatus === filter);
    });
  }, [inventory, search, filter]);
  const totalQuantity = inventory.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const totalValue = inventory.reduce((sum, item) => sum + (Number(item.storePrice) || 0) * (Number(item.quantity) || 1), 0);
  const availableCount = inventory.filter(item => (item.inventoryStatus || "Available") === "Available").length;

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setModalOpen(true);
  };
  const openEdit = item => {
    setEditingId(item.id);
    setForm(Object.fromEntries(FIELDS.map(field => [field.key, item[field.key] ?? (field.key === "quantity" ? "1" : "")])));
    setModalOpen(true);
  };

  const saveItem = async event => {
    event.preventDefault();
    if (!canManage) return;
    const quantity = Number(form.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      setMessage("Quantity must be a whole number of at least 1.", "error");
      return;
    }
    for (const field of ["acquisitionPrice", "storePrice", "megaSalePrice", "megaSalePercentage"]) {
      const value = form[field];
      if (value !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0 || (field === "megaSalePercentage" && Number(value) > 100))) {
        setMessage(field === "megaSalePercentage" ? "Mega Sale Percentage must be between 0 and 100." : "Prices cannot be negative.", "error");
        return;
      }
    }
    const payload = toDb({ ...form, quantity: String(quantity) });
    if (payload.sku === "") payload.sku = null;
    setBusy(true);
    const result = editingId
      ? await supabase.from(TABLE).update(payload).eq("id", editingId)
      : await supabase.from(TABLE).insert({ ...payload, created_by: userId });
    setBusy(false);
    if (result.error) {
      setMessage(`Could not save item: ${result.error.message}`, "error");
      return;
    }
    setModalOpen(false);
    setMessage(editingId ? "Inventory item updated." : "Inventory item added.", "success");
    await loadInventory();
  };

  const deleteItem = async item => {
    if (!canManage || !window.confirm(`Delete “${item.name || "this item"}”?`)) return;
    const { error } = await supabase.from(TABLE).delete().eq("id", item.id);
    if (error) { setMessage(`Could not delete item: ${error.message}`, "error"); return; }
    setMessage("Inventory item deleted.", "success");
    await loadInventory();
  };

  const clearAll = async () => {
    if (!canManage || !inventory.length || !window.confirm("Delete ALL inventory records? This cannot be undone.")) return;
    setBusy(true);
    const { error } = await supabase.from(TABLE).delete().not("id", "is", null);
    setBusy(false);
    if (error) { setMessage(`Could not clear inventory: ${error.message}`, "error"); return; }
    setMessage("Inventory cleared.", "success");
    await loadInventory();
  };

  const importRows = async (rows, source) => {
    const mapped = rows.filter(row => row && Object.values(row).some(value => String(value ?? "").trim() !== "")).map(mapSheetRow);
    if (!mapped.length) { setMessage(`No usable records found in ${source}.`, "error"); return; }
    const { data: existingRows, error } = await supabase.from(TABLE).select("id, sku");
    if (error) { setMessage(`Could not match existing SKUs: ${error.message}`, "error"); return; }
    const skuMap = new Map((existingRows || []).filter(row => row.sku).map(row => [String(row.sku).trim().toLowerCase(), row.id]));
    const updateMatches = window.confirm(`Found ${mapped.length} rows from ${source}.\n\nOK: update matching SKUs and add new records.\nCancel: skip rows with SKUs that already exist.`);
    let added = 0, updated = 0, skipped = 0;
    setBusy(true);
    for (const item of mapped) {
      const sku = String(item.sku || "").trim();
      const existingId = sku ? skuMap.get(sku.toLowerCase()) : null;
      if (existingId && !updateMatches) { skipped++; continue; }
      const payload = toDb(item);
      if (payload.sku === "") payload.sku = null;
      const result = existingId
        ? await supabase.from(TABLE).update(payload).eq("id", existingId)
        : await supabase.from(TABLE).insert({ ...payload, created_by: userId });
      if (result.error) {
        setBusy(false);
        await loadInventory();
        setMessage(`Import stopped after ${added} added, ${updated} updated, and ${skipped} skipped: ${result.error.message}`, "error");
        return;
      }
      if (existingId) updated++;
      else added++;
      if (sku && !existingId) {
        const { data: inserted } = await supabase.from(TABLE).select("id").eq("sku", sku).maybeSingle();
        if (inserted) skuMap.set(sku.toLowerCase(), inserted.id);
      }
    }
    setBusy(false);
    await loadInventory();
    setMessage(`Import complete: ${added} added, ${updated} updated, ${skipped} skipped. Source: ${source}`, "success");
  };

  const fetchSheet = async (urlValue = sheetUrl, automatic = false) => {
    const raw = String(urlValue || "").trim();
    if (!raw) { setMessage("Enter a published Google Sheets URL.", "error"); return; }
    setBusy(true);
    setMessage("Connecting to Google Sheets…");
    try {
      const url = new URL(raw);
      if (url.hostname !== "docs.google.com") throw new Error("Use a Google Sheets URL.");
      if (url.pathname.includes("/pub")) {
        url.searchParams.set("output", "csv");
      } else {
        const match = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
        if (!match) throw new Error("This does not appear to be a Google Sheets URL.");
        const gid = url.searchParams.get("gid") || "0";
        url.pathname = `/spreadsheets/d/${match[1]}/export`;
        url.search = "";
        url.searchParams.set("format", "csv");
        url.searchParams.set("gid", gid);
      }
      const response = await fetch(url.toString(), { mode: "cors", credentials: "omit", cache: "no-store" });
      if (!response.ok) throw new Error(`Google Sheets returned HTTP ${response.status}`);
      const text = await response.text();
      if (/^\s*</.test(text) || /<!doctype html/i.test(text.slice(0, 300))) throw new Error("Google returned HTML instead of CSV. Publish the sheet as CSV and check sharing permissions.");
      const workbook = XLSX.read(text, { type: "string" });
      const first = workbook.SheetNames[0];
      if (!first) throw new Error("No worksheet found.");
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[first], { defval: "", raw: false });
      await importRows(rows, "Google Sheets");
    } catch (error) {
      setMessage(`${automatic ? "Automatic sheet fetch" : "Fetch"} failed: ${error.message}. You can import the downloaded CSV or check the sheet's published sharing settings.`, "error");
    } finally {
      setBusy(false);
    }
  };

  const importFile = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const first = workbook.SheetNames[0];
      if (!first) throw new Error("No worksheet found.");
      await importRows(XLSX.utils.sheet_to_json(workbook.Sheets[first], { defval: "", raw: false }), file.name);
    } catch (error) {
      setMessage(`Import failed: ${error.message}`, "error");
    } finally {
      event.target.value = "";
    }
  };

  const download = (content, name, type) => {
    const blob = new Blob([content], { type });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = name;
    link.click();
    URL.revokeObjectURL(href);
  };
  const exportCsv = () => {
    const rows = [FIELDS.map(field => field.label), ...inventory.map(item => FIELDS.map(field => item[field.key] ?? ""))];
    const csv = rows.map(row => row.map(value => {
      const text = String(value ?? "");
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }).join(",")).join("\r\n");
    download(`\uFEFF${csv}`, "motherbase-resin-inventory.csv", "text/csv;charset=utf-8");
  };
  const exportBackup = () => download(JSON.stringify(inventory, null, 2), "motherbase-resin-backup.json", "application/json");

  return (
    <section className="resin-inventory">
      <div className="ri-heading">
        <div>
          <p className="ri-eyebrow">Toys &amp; Collectibles</p>
          <h1 className="ri-title">Resin Inventory</h1>
          <p className="ri-subtitle">Track stock, condition, pricing, and provenance.</p>
        </div>
        {canManage && <button className="ri-button ri-primary" onClick={openAdd}><PackagePlus size={16} /> Add Resin Item</button>}
      </div>

      <div className="ri-stats">
        <div className="ri-stat"><span>Total Records</span><strong>{inventory.length.toLocaleString()}</strong></div>
        <div className="ri-stat"><span>Total Quantity</span><strong>{totalQuantity.toLocaleString()}</strong></div>
        <div className="ri-stat"><span>Available Items</span><strong>{availableCount.toLocaleString()}</strong></div>
        <div className="ri-stat"><span>Total Store Value</span><strong>{money(totalValue)}</strong></div>
      </div>

      <section className="ri-panel">
        <div className="ri-panel-heading"><div><h2>Google Sheets Connection</h2><p>Import the published worksheet as CSV.</p></div></div>
        <form className="ri-url-row" onSubmit={event => { event.preventDefault(); void fetchSheet(); }}>
          <input type="url" aria-label="Google Sheets CSV URL" value={sheetUrl} onChange={event => setSheetUrl(event.target.value)} />
          {canManage && <button className="ri-button ri-green" type="submit" disabled={busy}><Download size={15} /> Fetch Spreadsheet</button>}
        </form>
        <p className={`ri-status ${statusType}`} role="status">{status}</p>
        <p className="ri-hint">{canManage ? "The sheet must be published as CSV. If browser CORS restrictions prevent fetching, import the downloaded CSV or connect through a backend proxy." : "Spreadsheet imports are limited to managers, executives, and superadmins."}</p>
      </section>

      <section className="ri-panel">
        <div className="ri-panel-heading"><div><h2>Inventory Tools</h2><p>Search, filter, import, and export inventory records.</p></div></div>
        <div className="ri-toolbar">
          <label className="ri-search"><Search size={16} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name, series, SKU, tags…" /></label>
          <select aria-label="Filter inventory by status" value={filter} onChange={event => setFilter(event.target.value)}>
            <option value="">All Statuses</option>{STATUSES.map(item => <option key={item}>{item}</option>)}
          </select>
          {canManage && <button className="ri-button ri-secondary" onClick={openAdd}><PackagePlus size={15} /> Add Item</button>}
          {canManage && <label className="ri-button ri-secondary ri-file-label"><Upload size={15} /> Import CSV/Excel<input type="file" accept=".csv,.xlsx,.xls" onChange={importFile} /></label>}
          {canManage && <button className="ri-button ri-secondary" onClick={exportCsv}><Download size={15} /> Export CSV</button>}
          {canManage && <button className="ri-button ri-secondary" onClick={exportBackup}><Download size={15} /> Backup JSON</button>}
          {canManage && <button className="ri-button ri-danger" onClick={clearAll} disabled={busy || !inventory.length}><Trash2 size={15} /> Clear Inventory</button>}
        </div>
        {!canManage && <p className="ri-hint">Inventory changes are limited to managers, executives, and superadmins.</p>}
      </section>

      <section className="ri-panel ri-table-panel">
        <div className="ri-panel-heading"><div><h2>Resin Inventory Table</h2><p>{loading ? "Loading records…" : `Showing ${shown.length.toLocaleString()} of ${inventory.length.toLocaleString()} records`}</p></div></div>
        <div className="ri-table-wrap">
          <table>
            <thead><tr>{FIELDS.map(field => <th key={field.key}>{field.label}</th>)}{canManage && <th>Actions</th>}</tr></thead>
            <tbody>
              {!shown.length && <tr><td colSpan={FIELDS.length + (canManage ? 1 : 0)} className="ri-empty">{loading ? "Loading inventory…" : "No inventory records found."}</td></tr>}
              {shown.map(item => (
                <tr key={item.id}>
                  {FIELDS.map(field => {
                    const value = item[field.key];
                    if (field.key === "picture") {
                      const imageUrl = safeImageUrl(value);
                      return <td key={field.key}>{imageUrl ? <a href={imageUrl} target="_blank" rel="noreferrer"><img className="ri-image" src={imageUrl} alt={item.name || "Inventory item"} onError={event => { event.currentTarget.hidden = true; }} /></a> : "—"}</td>;
                    }
                    if (["acquisitionPrice", "storePrice", "megaSalePrice"].includes(field.key)) return <td key={field.key}>{money(value)}</td>;
                    if (field.key === "megaSalePercentage") return <td key={field.key}>{value === "" ? "—" : `${value}%`}</td>;
                    if (["issues", "inclusions", "remarksOwner", "remarksEmployees"].includes(field.key)) return <td key={field.key} className="ri-wrap">{value || "—"}</td>;
                    return <td key={field.key}>{value || "—"}</td>;
                  })}
                  {canManage && <td><div className="ri-actions"><button aria-label={`Edit ${item.name}`} title="Edit item" onClick={() => openEdit(item)}><Pencil size={14} /></button><button aria-label={`Delete ${item.name}`} title="Delete item" onClick={() => void deleteItem(item)}><Trash2 size={14} /></button></div></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen && (
        <div className="ri-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setModalOpen(false); }}>
          <section className="ri-modal" role="dialog" aria-modal="true" aria-labelledby="ri-form-title">
            <form onSubmit={saveItem}>
              <div className="ri-modal-head"><h2 id="ri-form-title">{editingId ? "Edit Resin Item" : "Add Resin Item"}</h2><button type="button" aria-label="Close dialog" onClick={() => setModalOpen(false)}><X size={19} /></button></div>
              <div className="ri-modal-body"><div className="ri-form-grid">
                {FIELDS.map(field => <label className="ri-field" key={field.key}>
                  <span>{field.label}</span>
                  {field.type === "select" || field.type === "declaration" ? (
                    <select value={form[field.key]} onChange={event => setForm(current => ({ ...current, [field.key]: event.target.value }))}>
                      <option value="">— Select —</option>{(field.type === "select" ? STATUSES : DECLARATIONS).map(option => <option key={option}>{option}</option>)}
                    </select>
                  ) : field.type === "textarea" ? (
                    <textarea value={form[field.key]} onChange={event => setForm(current => ({ ...current, [field.key]: event.target.value }))} />
                  ) : (
                    <input required={field.key === "name"} type={field.type} value={form[field.key]} min={field.key === "quantity" ? 1 : field.type === "number" ? 0 : undefined} max={field.key === "megaSalePercentage" ? 100 : undefined} step={field.key === "quantity" ? 1 : field.type === "number" ? "any" : undefined} onChange={event => setForm(current => ({ ...current, [field.key]: event.target.value }))} />
                  )}
                </label>)}
              </div></div>
              <div className="ri-modal-foot"><button type="button" className="ri-button ri-secondary" onClick={() => setModalOpen(false)}>Cancel</button><button className="ri-button ri-green" type="submit" disabled={busy}>{busy ? "Saving…" : "Save Item"}</button></div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}