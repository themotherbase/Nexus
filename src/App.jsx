import React, { useState, useMemo, useEffect, createContext, useContext } from "react";
import {
  LayoutGrid, Users, ClipboardList, Bell, Settings, Network,
  Search, Plus, X, CircleAlert, Clock, CheckCircle2,
  Table2, CalendarDays, KanbanSquare, ShieldCheck, Pencil, Trash2,
  Repeat, TriangleAlert, ListTree, LogOut, Undo2
} from "lucide-react";
import { supabase } from "./supabaseClient";

/* ---------------------------------------------------------------
   DESIGN TOKENS
----------------------------------------------------------------*/
const C = {
  navy: "#1B2340", navySoft: "#2B3660", ink: "#20263D", paper: "#F1F0EC",
  card: "#FFFFFF", line: "#E4E2DC", amber: "#DD9A34", amberSoft: "#F6E6C7",
  coral: "#D8574C", coralSoft: "#F8E1DE", sage: "#4C8F6B", sageSoft: "#DEEBE3", slate: "#6B7280",
  blue: "#3B7DD8", blueSoft: "#E1EBFA", yellow: "#C99A11", yellowSoft: "#FBF0CB",
};
const LIGHT_THEME = { ...C };
const DARK_THEME = {
  navy: "#12162A", navySoft: "#1E2440", ink: "#E7E8EE", paper: "#14161F", card: "#1C1F2C",
  line: "#2B2F42", amber: "#E5A94A", amberSoft: "#3D2E12", coral: "#E3766B", coralSoft: "#3B1D1B",
  sage: "#63B085", sageSoft: "#1C3226", slate: "#9AA0B4", blue: "#6FA8E0", blueSoft: "#182B41",
  yellow: "#E3CB55", yellowSoft: "#332D10",
};
const FONT = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap');
  .mb-display { font-family: 'Fraunces', serif; font-optical-sizing: auto; }
  .mb-body { font-family: 'Inter', -apple-system, sans-serif; }
`;

// Departments are seeded in the DB; kept here too so colors render even
// before the first fetch resolves. If you add a department in SQL later,
// add its color here as well (or upgrade this to fetch from Supabase).
const DEPARTMENTS = [
  { id: "exec", name: "Executive", color: "#534AB7" },
  { id: "mkt", name: "Marketing / Live Selling", color: "#1D9E75" },
  { id: "ops", name: "Operations", color: "#BA7517" },
  { id: "admin", name: "Admin", color: "#D4537E" },
  { id: "inv", name: "Inventory / IT", color: "#378ADD" },
  { id: "log", name: "Logistics", color: "#639922" },
  { id: "sales", name: "Sales – Main", color: "#D85A30" },
  { id: "base3", name: "Base 3", color: "#E24B4A" },
];
const deptById = Object.fromEntries(DEPARTMENTS.map(d => [d.id, d]));

const STATUSES = ["Active", "On Leave", "Suspended", "Resigned", "Terminated"];
const ROLE_LABEL = { superadmin: "Super Admin", executive: "Executive", manager: "Manager", employee: "Employee" };
const COLUMNS = ["Backlog", "To Do", "In Progress", "For Review", "Completed"];

/* ---------------------------------------------------------------
   HELPERS
----------------------------------------------------------------*/
const today = () => new Date().toISOString().slice(0, 10);
const priColor = (p) => p === "High" ? C.coral : p === "Medium" ? C.amber : C.slate;
const statusMeta = (t) => {
  const overdue = t.due && t.due < today() && t.status !== "Completed";
  const dueToday = t.due === today() && t.status !== "Completed";
  if (overdue) return { label: "Overdue", color: C.coral };
  if (dueToday) return { label: "Due today", color: C.amber };
  if (t.status === "Completed") return { label: "Completed", color: C.sage };
  return { label: "On track", color: C.slate };
};
const initials = (name) => (name || "?").split(" ").map(n => n[0]).slice(0, 2).join("");
const collectDescendants = (id, employees) => {
  const kids = employees.filter(e => e.sup === id);
  return kids.reduce((acc, k) => [...acc, k.id, ...collectDescendants(k.id, employees)], []);
};
const slugify = (s) => (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const makeEmpId = (name, employees) => {
  const base = slugify(name) || "employee";
  const ids = new Set(employees.map(e => e.id));
  let id = base, i = 2;
  while (ids.has(id)) { id = `${base}-${i++}`; }
  return id;
};

// DB row (snake_case) <-> UI shape (camelCase, matches the rest of this file)
const mapEmployee = (row) => ({
  id: row.id, name: row.name, position: row.position, dept: row.dept_id,
  sup: row.supervisor_id, role: row.role, status: row.status,
  secondary: row.secondary_role || undefined, resp: row.responsibilities || [],
  canEditOrg: row.can_edit_org, email: row.email,
});
const mapTask = (row) => ({
  id: row.id, title: row.title, description: row.description, dept: row.dept_id,
  assignee: row.assignee_id, supervisor: row.supervisor_id, backup: row.backup_id,
  priority: row.priority, status: row.status, progress: row.progress, category: row.category,
  recurring: row.recurring, recurringCustomDays: row.recurring_custom_days, due: row.due_date, needsSignoff: row.needs_signoff, createdBy: row.created_by,
  subtasks: (row.subtasks || []).map(s => ({ id: s.id, title: s.title, done: s.done })),
  comments: (row.task_comments || [])
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map(c => ({ id: c.id, parent: c.parent_comment_id, author: c.author_id, text: c.body, time: new Date(c.created_at).toLocaleString() })),
  attachments: (row.task_attachments || [])
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map(a => ({ id: a.id, name: a.file_name, path: a.file_path, uploadedBy: a.uploaded_by, time: new Date(a.created_at).toLocaleString() })),
});

const EmpContext = createContext(null);
const useEmp = () => useContext(EmpContext);

/* ---------------------------------------------------------------
   AUTH GATE
----------------------------------------------------------------*/
function Login() {
  const [mode, setMode] = useState("signin"); // "signin" | "forgot"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setError(error.message);
  };

  const sendReset = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    setLoading(false);
    if (error) setError(error.message); else setResetSent(true);
  };

  if (mode === "forgot") {
    return (
      <div className="mb-body" style={{ minHeight: "100vh", background: C.paper, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{FONT}</style>
        <form onSubmit={sendReset} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 32, width: 360 }}>
          <div className="mb-display" style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Reset your password</div>
          <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 20 }}>Enter your email and we'll send you a reset link.</div>
          <FormRow label="Email"><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} style={inputStyle} /></FormRow>
          {resetSent && <div style={{ color: C.sage, fontSize: 12.5, marginBottom: 10 }}>Check your email for a reset link.</div>}
          {error && <div style={{ color: C.coral, fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
          <button type="submit" disabled={loading} style={{ width: "100%", background: C.amber, color: "#fff", border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
            {loading ? "Sending…" : "Send reset link"}
          </button>
          <button type="button" onClick={() => { setMode("signin"); setError(""); setResetSent(false); }} style={{ width: "100%", background: "none", border: "none", color: C.slate, fontSize: 12, marginTop: 12, cursor: "pointer" }}>
            ← Back to sign in
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="mb-body" style={{ minHeight: "100vh", background: C.paper, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{FONT}</style>
      <form onSubmit={submit} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 32, width: 360 }}>
        <div className="mb-display" style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>The Motherbase</div>
        <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 20 }}>Sign in to the Ops System</div>
        <FormRow label="Email"><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} style={inputStyle} /></FormRow>
        <FormRow label="Password"><input type="password" required value={password} onChange={e=>setPassword(e.target.value)} style={inputStyle} /></FormRow>
        {error && <div style={{ color: C.coral, fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
        <button type="submit" disabled={loading} style={{ width: "100%", background: C.amber, color: "#fff", border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
        <button type="button" onClick={() => setMode("forgot")} style={{ background: "none", border: "none", color: C.navy, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0, marginTop: 12 }}>
          Forgot password?
        </button>
        <div style={{ fontSize: 11.5, color: C.slate, marginTop: 14, lineHeight: 1.5 }}>
          First time? Check your email for the invite link to set your password. If you don't have an account yet, ask Jose Paulo, Andrea, Maria, or Julian to invite you.
        </div>
      </form>
    </div>
  );
}

function SetPassword({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    onDone();
  };

  return (
    <div className="mb-body" style={{ minHeight: "100vh", background: C.paper, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{FONT}</style>
      <form onSubmit={submit} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 32, width: 360 }}>
        <div className="mb-display" style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Welcome to The Motherbase</div>
        <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 20 }}>Set a password to finish creating your account.</div>
        <FormRow label="New password"><input type="password" required value={password} onChange={e=>setPassword(e.target.value)} style={inputStyle} /></FormRow>
        <FormRow label="Confirm password"><input type="password" required value={confirm} onChange={e=>setConfirm(e.target.value)} style={inputStyle} /></FormRow>
        {error && <div style={{ color: C.coral, fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
        <button type="submit" disabled={loading} style={{ width: "100%", background: C.amber, color: "#fff", border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
          {loading ? "Saving…" : "Set password & continue"}
        </button>
      </form>
    </div>
  );
}

function NotLinked({ email }) {
  return (
    <div className="mb-body" style={{ minHeight: "100vh", background: C.paper, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 20 }}>
      <div>
        <div className="mb-display" style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Account not linked yet</div>
        <div style={{ fontSize: 13.5, color: C.slate, maxWidth: 360 }}>
          You're signed in as {email}, but no employee record uses this email yet. Ask Jose Paulo, Andrea, Maria, or Julian
          to set your email on your employee profile, then sign out and back in.
        </div>
        <button onClick={() => supabase.auth.signOut()} style={{ marginTop: 16, background: "none", border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 16px", cursor: "pointer" }}>
          Sign out
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   MAIN APP
----------------------------------------------------------------*/
// Reads Supabase's #access_token=...&type=invite (or recovery) hash params.
function getAuthHashParams() {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  return Object.fromEntries(new URLSearchParams(hash));
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = logged out
  const [authFlow, setAuthFlow] = useState(() => {
    const { type, access_token } = getAuthHashParams();
    // Any of these link types mean the person hasn't set/confirmed a password yet.
    // We also fall back to "any access_token present" so an unfamiliar type string
    // (Supabase has several: invite, recovery, signup, magiclink, email_change)
    // still routes through Set Password instead of silently landing on the dashboard.
    if (!access_token) return null;
    return type || "invite";
  });
  const [employees, setEmployees] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [page, setPage] = useState("dashboard");
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [editingEmp, setEditingEmp] = useState(undefined);
  const [orgView, setOrgView] = useState("chart");
  const [taskView, setTaskView] = useState("kanban");
  const [search, setSearch] = useState("");
  const [showAddTask, setShowAddTask] = useState(false);
  const [taskDetail, setTaskDetail] = useState(null);
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem("mb-dark") === "1"; } catch { return false; }
  });
  const [onlineIds, setOnlineIds] = useState(new Set());

  // Mutate the shared color-token object in place so every component (which reads
  // C.xxx live at render time) picks up the theme without threading it through props.
  Object.assign(C, dark ? DARK_THEME : LIGHT_THEME);
  useEffect(() => { try { localStorage.setItem("mb-dark", dark ? "1" : "0"); } catch {} }, [dark]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const refetchEmployees = async () => {
    const { data, error } = await supabase.from("employees").select("*").order("name");
    if (!error) setEmployees((data || []).map(mapEmployee));
  };
  const refetchTasks = async () => {
    const { data, error } = await supabase
      .from("tasks")
      .select("*, subtasks(*), task_comments(*)")
      .order("due_date");
    if (!error) setTasks((data || []).map(mapTask));
  };

  useEffect(() => {
    if (!session) return;
    (async () => {
      setLoadingData(true);
      // Auto-link this login to an employee row on first sign-in, by email
      await supabase.from("employees")
        .update({ auth_user_id: session.user.id })
        .eq("email", session.user.email)
        .is("auth_user_id", null);
      await Promise.all([refetchEmployees(), refetchTasks()]);
      setLoadingData(false);
    })();
  }, [session]);

  const byId = useMemo(() => Object.fromEntries(employees.map(e => [e.id, e])), [employees]);
  const directReports = (id) => employees.filter(e => e.sup === id);
  const me = useMemo(() => employees.find(e => e.email === session?.user?.email), [employees, session]);

  // Presence: lets everyone see who else is currently signed into the app.
  useEffect(() => {
    if (!me) return;
    const channel = supabase.channel("presence-online", { config: { presence: { key: me.id } } });
    channel.on("presence", { event: "sync" }, () => {
      setOnlineIds(new Set(Object.keys(channel.presenceState())));
    });
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") await channel.track({ at: new Date().toISOString() });
    });
    return () => { supabase.removeChannel(channel); };
  }, [me?.id]);

  if (session === undefined) return <FullScreenMsg text="Loading…" />;
  if (authFlow && session) {
    return (
      <SetPassword
        onDone={() => {
          setAuthFlow(null);
          window.history.replaceState(null, "", window.location.pathname);
        }}
      />
    );
  }
  if (session === null) return <Login />;

  if (!loadingData && !me) return <NotLinked email={session.user.email} />;
  if (loadingData || !me) return <FullScreenMsg text="Loading your workspace…" />;

  const viewerEmp = me;
  const isAdmin = viewerEmp.role === "superadmin";
  const isExec = viewerEmp.role === "executive" || isAdmin;
  const isManager = viewerEmp.role === "manager" || isExec;
  const canEditOrg = !!viewerEmp.canEditOrg;

  const visibleTasks = isExec ? tasks
    : viewerEmp.role === "manager"
      ? tasks.filter(t => new Set([viewerEmp.id, ...directReports(viewerEmp.id).map(e=>e.id)]).has(t.assignee) || t.supervisor === viewerEmp.id)
      : tasks.filter(t => t.assignee === viewerEmp.id);

  const updateTask = async (id, patch) => {
    const { error } = await supabase.from("tasks").update(patch).eq("id", id);
    if (error) alert(error.message);
    await refetchTasks();
  };
  const setTaskStatus = (id, status) => {
    const patch = { status };
    if (status === "Completed") patch.progress = 100;
    return updateTask(id, patch);
  };
  const addComment = async (id, text, parentId = null) => {
    const payload = { task_id: id, author_id: viewerEmp.id, body: text };
    if (parentId) payload.parent_comment_id = parentId;
    let { error } = await supabase.from("task_comments").insert(payload);
    if (error && payload.parent_comment_id) {
      // parent_comment_id column may not exist yet (reply migration not run) — retry as a plain comment
      delete payload.parent_comment_id;
      ({ error } = await supabase.from("task_comments").insert(payload));
    }
    if (error) alert("Comment didn't save: " + error.message);
    await refetchTasks();
  };
  const createTask = async (t) => {
    const { data, error } = await supabase.from("tasks").insert({
      title: t.title, dept_id: t.dept, assignee_id: t.assignee, supervisor_id: t.supervisor,
      priority: t.priority, status: t.status, due_date: t.due, progress: t.progress,
      category: t.category, recurring: t.recurring, recurring_custom_days: t.recurringCustomDays ?? null, created_by: t.createdBy, needs_signoff: t.needsSignoff,
    }).select().single();
    if (error) { alert(error.message); return null; }
    await refetchTasks();
    return data?.id ?? null;
  };
  const attachFile = async (taskId, file) => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${taskId}/${Date.now()}-${safeName}`;
    const { error: upErr } = await supabase.storage.from("task-attachments").upload(path, file);
    if (upErr) { alert("File didn't upload: " + upErr.message); return; }
    const { error: rowErr } = await supabase.from("task_attachments").insert({ task_id: taskId, file_name: file.name, file_path: path, uploaded_by: viewerEmp.id });
    if (rowErr) alert("File didn't upload: " + rowErr.message);
    await refetchTasks();
  };

  const addEmployee = async (data) => {
    const id = makeEmpId(data.name, employees);
    await supabase.from("employees").insert({
      id, name: data.name, position: data.position, dept_id: data.dept, supervisor_id: data.sup,
      role: data.role, status: data.status, secondary_role: data.secondary || null,
      responsibilities: data.resp, email: data.email || null,
    });
    setEditingEmp(undefined);
    await refetchEmployees();
  };
  const updateEmployee = async (id, patch) => {
    await supabase.from("employees").update({
      name: patch.name, position: patch.position, dept_id: patch.dept, supervisor_id: patch.sup,
      role: patch.role, status: patch.status, secondary_role: patch.secondary || null,
      responsibilities: patch.resp, email: patch.email || null,
    }).eq("id", id);
    setEditingEmp(undefined);
    await refetchEmployees();
  };
  const deleteEmployee = async (id) => {
    const emp = byId[id];
    const fallback = emp?.sup || employees.find(e => e.id !== id && !e.sup)?.id || null;
    await supabase.from("employees").update({ supervisor_id: fallback }).eq("supervisor_id", id);
    for (const field of ["assignee_id", "supervisor_id", "backup_id", "created_by"]) {
      await supabase.from("tasks").update({ [field]: fallback }).eq(field, id);
    }
    await supabase.from("employees").delete().eq("id", id);
    setEditingEmp(undefined);
    if (selectedEmp === id) setSelectedEmp(null);
    await Promise.all([refetchEmployees(), refetchTasks()]);
  };

  const nav = [
    { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
    { id: "organization", label: "Organization", icon: Network },
    { id: "employees", label: "Employees", icon: Users },
    { id: "tasks", label: "Tasks", icon: ClipboardList },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <EmpContext.Provider value={{ employees, byId, directReports, addEmployee, updateEmployee, deleteEmployee, canEditOrg, onlineIds }}>
      <div className="mb-body" style={{ background: C.paper, minHeight: "100vh", color: C.ink, display: "flex" }}>
        <style>{FONT}</style>

        <aside style={{ width: 236, background: C.navy, color: "#fff", display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: "22px 20px 16px" }}>
            <div className="mb-display" style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.15 }}>The Motherbase</div>
            <div style={{ fontSize: 11.5, color: "#9FA6C4", marginTop: 2 }}>Toys &amp; Collectibles · Ops System</div>
          </div>
          <nav style={{ padding: "6px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
            {nav.map(n => {
              const Icon = n.icon;
              const active = page === n.id;
              return (
                <button key={n.id} onClick={() => setPage(n.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8,
                    background: active ? "rgba(255,255,255,0.1)" : "transparent",
                    border: "none", color: active ? "#fff" : "#B7BCD6", cursor: "pointer",
                    fontSize: 13.5, fontWeight: active ? 600 : 500, textAlign: "left", width: "100%",
                  }}>
                  <Icon size={16} strokeWidth={2} />
                  {n.label}
                </button>
              );
            })}
          </nav>

          <div style={{ marginTop: "auto", padding: 14, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Avatar name={viewerEmp.name} size={30} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{viewerEmp.name}</div>
                <div style={{ fontSize: 10.5, color: "#9FA6C4" }}>{ROLE_LABEL[viewerEmp.role]}</div>
              </div>
            </div>
            {canEditOrg && <div style={{ fontSize: 10, color: "#8DE0B0", marginBottom: 8 }}>✓ Can edit org & employees</div>}
            <button onClick={() => supabase.auth.signOut()} style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", background: C.navySoft, color: "#fff", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "7px 8px", fontSize: 12, cursor: "pointer" }}>
              <LogOut size={13} /> Sign out
            </button>
          </div>
        </aside>

        <main style={{ flex: 1, minWidth: 0, padding: "26px 34px 60px" }}>
          {page === "dashboard" && <Dashboard tasks={tasks} viewerEmp={viewerEmp} isManager={isManager} isExec={isExec} setPage={setPage} setTaskDetail={setTaskDetail} />}
          {page === "organization" && (
            <Organization orgView={orgView} setOrgView={setOrgView} setSelectedEmp={setSelectedEmp}
              search={search} setSearch={setSearch} onAdd={() => setEditingEmp(null)} onEdit={setEditingEmp} />
          )}
          {page === "employees" && (
            <EmployeesList setSelectedEmp={setSelectedEmp} search={search} setSearch={setSearch} tasks={tasks} onAdd={() => setEditingEmp(null)} />
          )}
          {page === "tasks" && (
            <Tasks tasks={visibleTasks} taskView={taskView} setTaskView={setTaskView}
              setTaskStatus={setTaskStatus} viewerEmp={viewerEmp}
              canCreate={isManager} setShowAddTask={setShowAddTask} setTaskDetail={setTaskDetail} />
          )}
          {page === "notifications" && <Notifications tasks={visibleTasks} />}
          {page === "settings" && <SettingsPage isAdmin={isAdmin} dark={dark} setDark={setDark} />}
        </main>

        {selectedEmp && (
          <EmployeeModal empId={selectedEmp} tasks={tasks} onClose={() => setSelectedEmp(null)}
            setSelectedEmp={setSelectedEmp} onEdit={() => setEditingEmp(byId[selectedEmp])} />
        )}
        {editingEmp !== undefined && <EmployeeFormModal employee={editingEmp} onClose={() => setEditingEmp(undefined)} />}
        {showAddTask && (
          <AddTaskModal onClose={() => setShowAddTask(false)} onCreate={createTask} onAttach={attachFile} createdBy={viewerEmp.id} />
        )}
        {taskDetail && (
          <TaskDetailModal task={tasks.find(t=>t.id===taskDetail)} onClose={() => setTaskDetail(null)}
            addComment={addComment} viewerEmp={viewerEmp} setTaskStatus={setTaskStatus}
            updateTask={updateTask} refetchTasks={refetchTasks} />
        )}
      </div>
    </EmpContext.Provider>
  );
}

function FullScreenMsg({ text }) {
  return (
    <div className="mb-body" style={{ minHeight: "100vh", background: C.paper, display: "flex", alignItems: "center", justifyContent: "center", color: C.slate, fontSize: 14 }}>
      <style>{FONT}</style>
      {text}
    </div>
  );
}

/* ---------------------------------------------------------------
   DASHBOARD
----------------------------------------------------------------*/
function Dashboard({ tasks, viewerEmp, isManager, isExec, setPage, setTaskDetail }) {
  const { employees, directReports, onlineIds } = useEmp();
  const goToTask = (id) => { setTaskDetail(id); setPage("tasks"); };
  const scoped = isExec ? tasks : isManager
    ? tasks.filter(t => [viewerEmp.id, ...directReports(viewerEmp.id).map(e=>e.id)].includes(t.assignee))
    : tasks.filter(t => t.assignee === viewerEmp.id);

  const overdue = scoped.filter(t => statusMeta(t).label === "Overdue");
  const dueToday = scoped.filter(t => statusMeta(t).label === "Due today");
  const completed = scoped.filter(t => t.status === "Completed");

  const byDept = DEPARTMENTS.map(dep => ({
    ...dep, count: scoped.filter(t => t.dept === dep.id && t.status !== "Completed").length,
  })).filter(dd => dd.count > 0);

  const workload = employees.map(e => ({
    emp: e,
    active: tasks.filter(t => t.assignee === e.id && t.status !== "Completed").length,
    highPri: tasks.filter(t => t.assignee === e.id && t.priority === "High" && t.status !== "Completed").length,
  })).filter(w => w.active > 0).sort((a,b) => b.active - a.active);

  return (
    <div>
      <PageHeader
        eyebrow={isExec ? "Company overview" : isManager ? "Team overview" : "My dashboard"}
        title={isExec ? "Dashboard" : isManager ? `${viewerEmp.name.split(" ")[0]}'s Team` : "My Tasks"}
      />

      {isExec && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 22 }}>
          <StatCard label="Employees" value={employees.length} sub={`${employees.filter(e=>e.status==="Active").length} active`} />
          <StatCard label="Departments" value={DEPARTMENTS.length} sub="editable in Settings" />
          <StatCard label="Open tasks" value={tasks.filter(t=>t.status!=="Completed").length} sub={`${completed.length} completed`} />
          <StatCard label="Overdue" value={overdue.length} sub="needs attention" accent={overdue.length>0 ? C.coral : undefined} />
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: isExec ? "1.3fr 1fr" : "1fr", gap: 18 }}>
        <Panel title="Management alerts">
          <AlertRow icon={CircleAlert} color={C.coral} label="Overdue" items={overdue} onOpen={goToTask} />
          <AlertRow icon={Clock} color={C.amber} label="Due today" items={dueToday} onOpen={goToTask} />
          <AlertRow icon={CheckCircle2} color={C.sage} label="Recently completed" items={completed.slice(-3)} onOpen={goToTask} />
        </Panel>

        {isExec && (
          <Panel title="Tasks by department">
            {byDept.length === 0 && <Empty text="No open tasks right now." />}
            {byDept.map(dep => (
              <div key={dep.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0" }}>
                <div style={{ width: 9, height: 9, borderRadius: 9, background: dep.color }} />
                <div style={{ fontSize: 13, flex: 1 }}>{dep.name}</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{dep.count}</div>
              </div>
            ))}
          </Panel>
        )}
      </div>

      <Panel title={`Online now (${employees.filter(e => onlineIds.has(e.id)).length})`} style={{ marginTop: 18 }}>
        {employees.filter(e => onlineIds.has(e.id)).length === 0 && <Empty text="No one else is online right now." />}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          {employees.filter(e => onlineIds.has(e.id)).map(e => (
            <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Avatar name={e.name} size={26} online />
              <span style={{ fontSize: 12.5 }}>{e.name}</span>
            </div>
          ))}
        </div>
      </Panel>

      {isManager && (
        <Panel title={isExec ? "Workload by employee" : "My team's workload"} style={{ marginTop: 18 }}>
          {workload.filter(w => isExec || [viewerEmp.id, ...directReports(viewerEmp.id).map(e=>e.id)].includes(w.emp.id)).map(w => (
            <div key={w.emp.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: `1px solid ${C.line}` }}>
              <Avatar name={w.emp.name} online={onlineIds.has(w.emp.id)} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{w.emp.name}</div>
                <div style={{ fontSize: 11.5, color: C.slate }}>{deptById[w.emp.dept]?.name}</div>
              </div>
              <div style={{ fontSize: 13, color: C.slate }}>{w.active} active</div>
              {w.highPri >= 3 && (
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: C.coral, background: C.coralSoft, padding: "3px 8px", borderRadius: 20 }}>
                  <TriangleAlert size={12} /> Potentially overloaded
                </span>
              )}
            </div>
          ))}
        </Panel>
      )}

      {!isManager && (
        <Panel title="My tasks" style={{ marginTop: 18 }}>
          {scoped.length === 0 && <Empty text="Nothing assigned yet." />}
          {scoped.map(t => <MiniTaskRow key={t.id} t={t} onClick={() => goToTask(t.id)} />)}
        </Panel>
      )}
    </div>
  );
}

function AlertRow({ icon: Icon, color, label, items, onOpen }) {
  const { byId } = useEmp();
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
        <Icon size={14} color={color} />
        <span style={{ fontSize: 12.5, fontWeight: 600, color }}>{label}</span>
        <span style={{ fontSize: 12, color: C.slate }}>({items.length})</span>
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 12.5, color: C.slate, paddingLeft: 21 }}>None right now.</div>
      ) : items.slice(0,4).map(t => (
        <div key={t.id} onClick={() => onOpen?.(t.id)} style={{ fontSize: 13, padding: "3px 0 3px 21px", color: C.ink, cursor: onOpen ? "pointer" : "default" }}>
          {t.title} <span style={{ color: C.slate }}>— {byId[t.assignee]?.name || "Unassigned"}</span>
        </div>
      ))}
    </div>
  );
}

function MiniTaskRow({ t, onClick }) {
  const meta = statusMeta(t);
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${C.line}`, cursor: "pointer" }}>
      <div style={{ width: 7, height: 7, borderRadius: 7, background: meta.color, flexShrink: 0 }} />
      <div style={{ flex: 1, fontSize: 13.5 }}>{t.title}</div>
      <div style={{ fontSize: 11.5, color: meta.color, fontWeight: 600 }}>{meta.label}</div>
      <div style={{ fontSize: 11.5, color: C.slate, width: 70, textAlign: "right" }}>{t.status}</div>
    </div>
  );
}

/* ---------------------------------------------------------------
   ORGANIZATION
----------------------------------------------------------------*/
function Organization({ orgView, setOrgView, setSelectedEmp, search, setSearch, onAdd, onEdit }) {
  const { employees, canEditOrg } = useEmp();
  const filtered = employees.filter(e => e.name.toLowerCase().includes(search.toLowerCase()) || e.position.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <PageHeader eyebrow="Organization" title="Structure & Reporting" actions={
        <div style={{ display: "flex", gap: 8 }}>
          <ToggleBtn active={orgView==="chart"} onClick={()=>setOrgView("chart")} icon={ListTree} label="Org Chart" />
          <ToggleBtn active={orgView==="list"} onClick={()=>setOrgView("list")} icon={Table2} label="List View" />
          {canEditOrg && (
            <button onClick={onAdd} style={{ display: "flex", alignItems: "center", gap: 6, background: C.amber, color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
              <Plus size={14} /> Add Employee
            </button>
          )}
        </div>
      } />

      {orgView === "list" && <SearchBar value={search} onChange={setSearch} placeholder="Search employees, positions, departments…" />}

      {orgView === "chart" ? (
        <OrgChartPyramid onSelect={setSelectedEmp} onEdit={onEdit} />
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: C.paper, textAlign: "left" }}>
                {["Employee","Position","Department","Supervisor","Status",""].map(h => (
                  <th key={h} style={{ padding: "10px 16px", fontSize: 11.5, color: C.slate, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => <RowWithEdit key={e.id} e={e} onSelect={setSelectedEmp} onEdit={onEdit} canEditOrg={canEditOrg} />)}
            </tbody>
          </table>
        </div>
      )}
      {!canEditOrg && (
        <div style={{ marginTop: 12, fontSize: 12, color: C.slate }}>
          Only Jose Paulo, Andrea, Maria, and Julian can add, edit, or remove employees.
        </div>
      )}
    </div>
  );
}

function RowWithEdit({ e, onSelect, onEdit, canEditOrg }) {
  const { byId } = useEmp();
  return (
    <tr style={{ borderTop: `1px solid ${C.line}` }}>
      <td onClick={() => onSelect(e.id)} style={{ padding: "10px 16px", fontWeight: 600, cursor: "pointer" }}>{e.name}</td>
      <td onClick={() => onSelect(e.id)} style={{ padding: "10px 16px", color: C.slate, cursor: "pointer" }}>{e.position}</td>
      <td onClick={() => onSelect(e.id)} style={{ padding: "10px 16px", cursor: "pointer" }}><DeptTag id={e.dept} /></td>
      <td onClick={() => onSelect(e.id)} style={{ padding: "10px 16px", color: C.slate, cursor: "pointer" }}>{e.sup ? (byId[e.sup]?.name || "—") : "—"}</td>
      <td onClick={() => onSelect(e.id)} style={{ padding: "10px 16px", cursor: "pointer" }}><StatusPill status={e.status} /></td>
      <td style={{ padding: "10px 16px" }}>
        {canEditOrg && <button onClick={() => onEdit(e)} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate }}><Pencil size={14} /></button>}
      </td>
    </tr>
  );
}

function OrgChartPyramid({ onSelect, onEdit }) {
  const { employees, canEditOrg, deleteEmployee } = useEmp();
  const NODE_W = 172, NODE_H = 96, GAP_X = 22, GAP_Y = 46;

  const layout = useMemo(() => {
    const empIds = new Set(employees.map(e => e.id));
    const roots = employees.filter(e => !e.sup || !empIds.has(e.sup));
    const childrenOf = (id) => employees.filter(e => e.sup === id);
    const positions = {}, depths = {};
    let slot = 0;
    const visited = new Set();
    const walk = (emp, depth) => {
      if (visited.has(emp.id)) return;
      visited.add(emp.id);
      depths[emp.id] = depth;
      const kids = childrenOf(emp.id);
      if (kids.length === 0) { positions[emp.id] = slot; slot += 1; }
      else {
        kids.forEach(k => walk(k, depth + 1));
        const xs = kids.map(k => positions[k.id]).filter(x => x !== undefined);
        positions[emp.id] = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : slot++;
      }
    };
    roots.forEach(r => walk(r, 0));
    employees.forEach(e => { if (!visited.has(e.id)) walk(e, 0); });
    const maxDepth = Math.max(0, ...Object.values(depths));
    const maxSlot = Math.max(0, ...Object.values(positions));
    return { positions, depths, width: (maxSlot + 1) * (NODE_W + GAP_X), height: (maxDepth + 1) * (NODE_H + GAP_Y) };
  }, [employees]);

  const px = (id) => layout.positions[id] * (NODE_W + GAP_X);
  const py = (id) => layout.depths[id] * (NODE_H + GAP_Y);

  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: "24px 16px 50px", overflowX: "auto" }}>
      <div style={{ position: "relative", width: Math.max(layout.width, 400), height: layout.height + NODE_H, margin: "0 auto" }}>
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }}>
          <defs>
            <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M2 1L8 5L2 9" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" stroke="context-stroke" />
            </marker>
          </defs>
          {employees.filter(e => e.sup && layout.positions[e.sup] !== undefined).map(e => {
            const x1 = px(e.sup) + NODE_W/2, y1 = py(e.sup) + NODE_H;
            const x2 = px(e.id) + NODE_W/2, y2 = py(e.id);
            const ym = (y1 + y2) / 2;
            const color = deptById[e.dept]?.color || C.slate;
            return <path key={e.id} d={`M${x1} ${y1} L${x1} ${ym} L${x2} ${ym} L${x2} ${y2}`} fill="none" stroke={color} strokeWidth="1.5" strokeOpacity="0.65" markerEnd="url(#arr)" />;
          })}
        </svg>

        {employees.map(e => {
          const dep = deptById[e.dept] || { color: C.slate, name: e.dept };
          return (
            <div key={e.id} style={{
              position: "absolute", left: px(e.id), top: py(e.id), width: NODE_W,
              background: C.card, border: `1.5px ${e.secondary ? "dashed" : "solid"} ${dep.color}`,
              borderRadius: 10, padding: "8px 10px", cursor: "pointer", boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
            }}>
              <div onClick={() => onSelect(e.id)} style={{ marginBottom: 2 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, lineHeight: 1.25 }}>{e.name}</div>
                <div style={{ fontSize: 10, color: C.slate, lineHeight: 1.3, marginTop: 1 }}>{e.position}</div>
                <span style={{ fontSize: 9, fontWeight: 500, marginTop: 4, padding: "1px 6px", borderRadius: 8, display: "inline-block", background: dep.color + "18", color: dep.color }}>{dep.name}</span>
                {e.secondary && <div style={{ fontSize: 8.5, padding: "1px 5px", borderRadius: 6, background: C.amberSoft, color: "#633806", border: "1px solid #EF9F27", marginTop: 3, display: "inline-block" }}>{e.secondary}</div>}
              </div>
              {canEditOrg && (
                <div style={{ display: "flex", gap: 6, marginTop: 6, borderTop: `1px solid ${C.line}`, paddingTop: 5 }}>
                  <button onClick={(ev) => { ev.stopPropagation(); onEdit(e); }} style={{ background: "none", border: "none", cursor: "pointer", color: C.slate, display: "flex", alignItems: "center", gap: 3, fontSize: 10 }}>
                    <Pencil size={11} /> Edit
                  </button>
                  {e.sup && (
                    <button onClick={(ev) => { ev.stopPropagation(); if (window.confirm(`Remove ${e.name}? Their direct reports move up to their supervisor.`)) deleteEmployee(e.id); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: C.coral, display: "flex", alignItems: "center", gap: 3, fontSize: 10 }}>
                      <Trash2 size={11} /> Remove
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 10.5, color: C.slate, alignItems: "center", marginTop: 10, paddingLeft: 4 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 24, height: 2, background: C.navy, display: "inline-block" }} /> Solid border = single role</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 24, height: 0, borderTop: `2px dashed ${C.amber}`, display: "inline-block" }} /> Dashed border = dual-role person</span>
      </div>
    </div>
  );
}

function EmployeeFormModal({ employee, onClose }) {
  const { employees, addEmployee, updateEmployee, deleteEmployee } = useEmp();
  const isEdit = !!employee;
  const [name, setName] = useState(employee?.name || "");
  const [position, setPosition] = useState(employee?.position || "");
  const [email, setEmail] = useState(employee?.email || "");
  const [dept, setDept] = useState(employee?.dept || DEPARTMENTS[0].id);
  const [sup, setSup] = useState(employee?.sup || "");
  const [role, setRole] = useState(employee?.role || "employee");
  const [status, setStatus] = useState(employee?.status || "Active");
  const [secondary, setSecondary] = useState(employee?.secondary || "");
  const [resp, setResp] = useState((employee?.resp || []).join("\n"));
  const [error, setError] = useState("");

  const blockedSupervisors = isEdit ? new Set([employee.id, ...collectDescendants(employee.id, employees)]) : new Set();
  const supervisorOptions = employees.filter(e => !blockedSupervisors.has(e.id));

  const submit = async () => {
    if (!name.trim() || !position.trim()) { setError("Name and position are required."); return; }
    const data = { name: name.trim(), position: position.trim(), dept, sup: sup || null, role, status,
      secondary: secondary.trim() || undefined, email: email.trim() || undefined,
      resp: resp.split("\n").map(r => r.trim()).filter(Boolean) };
    if (isEdit) await updateEmployee(employee.id, data);
    else await addEmployee(data);
  };

  return (
    <ModalShell onClose={onClose} width={480}>
      <div className="mb-display" style={{ fontSize: 19, fontWeight: 600, marginBottom: 16 }}>{isEdit ? "Edit Employee" : "Add Employee"}</div>
      <FormRow label="Full name"><input value={name} onChange={e=>setName(e.target.value)} style={inputStyle} /></FormRow>
      <FormRow label="Position / title"><input value={position} onChange={e=>setPosition(e.target.value)} style={inputStyle} /></FormRow>
      <FormRow label="Login email (used to link their account)"><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@themotherbase.com" style={inputStyle} /></FormRow>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <FormRow label="Department">
          <select value={dept} onChange={e=>setDept(e.target.value)} style={inputStyle}>
            {DEPARTMENTS.map(dp => <option key={dp.id} value={dp.id}>{dp.name}</option>)}
          </select>
        </FormRow>
        <FormRow label="Reports to">
          <select value={sup || ""} onChange={e=>setSup(e.target.value)} style={inputStyle}>
            <option value="">— None (top of org) —</option>
            {supervisorOptions.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </FormRow>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <FormRow label="Permission role">
          <select value={role} onChange={e=>setRole(e.target.value)} style={inputStyle}>
            <option value="superadmin">Super Admin</option><option value="executive">Executive</option>
            <option value="manager">Manager</option><option value="employee">Employee</option>
          </select>
        </FormRow>
        <FormRow label="Employment status">
          <select value={status} onChange={e=>setStatus(e.target.value)} style={inputStyle}>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </FormRow>
      </div>
      <FormRow label="Secondary role (optional)"><input value={secondary} onChange={e=>setSecondary(e.target.value)} placeholder="e.g. Also: Base 3 Lead" style={inputStyle} /></FormRow>
      <FormRow label="Main responsibilities (one per line)">
        <textarea value={resp} onChange={e=>setResp(e.target.value)} rows={4} style={{ ...inputStyle, resize: "vertical" }} />
      </FormRow>
      {error && <div style={{ color: C.coral, fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
      <button onClick={submit} style={{ width: "100%", background: C.amber, color: "#fff", border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
        {isEdit ? "Save Changes" : "Add Employee"}
      </button>
      {isEdit && (
        <button onClick={() => { if (window.confirm(`Remove ${employee.name}?`)) deleteEmployee(employee.id); }}
          style={{ width: "100%", background: "none", color: C.coral, border: `1px solid ${C.coralSoft}`, borderRadius: 8, padding: "9px 0", fontWeight: 600, fontSize: 13, cursor: "pointer", marginTop: 10 }}>
          Delete Employee
        </button>
      )}
    </ModalShell>
  );
}

function DeptTag({ id }) {
  const dep = deptById[id] || { color: C.slate, name: id };
  return <span style={{ fontSize: 11, fontWeight: 600, color: dep.color, background: dep.color+"18", padding: "3px 9px", borderRadius: 20 }}>{dep.name}</span>;
}
function StatusPill({ status }) {
  const color = status === "Active" ? C.sage : status === "On Leave" ? C.amber : C.slate;
  return <span style={{ fontSize: 11, fontWeight: 600, color, background: color+"18", padding: "3px 9px", borderRadius: 20 }}>{status}</span>;
}

function EmployeesList({ setSelectedEmp, search, setSearch, tasks, onAdd }) {
  const { employees, canEditOrg, onlineIds } = useEmp();
  const filtered = employees.filter(e => e.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div>
      <PageHeader eyebrow="Directory" title="Employees" actions={
        canEditOrg && <button onClick={onAdd} style={{ display: "flex", alignItems: "center", gap: 6, background: C.amber, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}><Plus size={15} /> Add Employee</button>
      } />
      <SearchBar value={search} onChange={setSearch} placeholder="Search employees…" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {filtered.map(e => {
          const active = tasks.filter(t => t.assignee === e.id && t.status !== "Completed").length;
          return (
            <div key={e.id} onClick={() => setSelectedEmp(e.id)} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16, cursor: "pointer" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                <Avatar name={e.name} size={38} online={onlineIds.has(e.id)} />
                <div><div style={{ fontWeight: 600, fontSize: 14 }}>{e.name}</div><div style={{ fontSize: 12, color: C.slate }}>{e.position}</div></div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <DeptTag id={e.dept} /><span style={{ fontSize: 12, color: C.slate }}>{active} active</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmployeeModal({ empId, tasks, onClose, setSelectedEmp, onEdit }) {
  const { byId, directReports, canEditOrg } = useEmp();
  const emp = byId[empId];
  if (!emp) return null;
  const myTasks = tasks.filter(t => t.assignee === emp.id);
  const stats = { total: myTasks.length, completed: myTasks.filter(t => t.status === "Completed").length, inProgress: myTasks.filter(t => t.status === "In Progress").length };
  const rate = stats.total ? Math.round((stats.completed/stats.total)*100) : 0;
  const reports = directReports(emp.id);

  return (
    <ModalShell onClose={onClose} width={560}>
      <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 18 }}>
        <Avatar name={emp.name} size={52} />
        <div style={{ flex: 1 }}><div className="mb-display" style={{ fontSize: 20, fontWeight: 600 }}>{emp.name}</div><div style={{ fontSize: 13, color: C.slate }}>{emp.position}</div></div>
        <DeptTag id={emp.dept} />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        <StatusPill status={emp.status} />
        {emp.secondary && <span style={{ fontSize: 11, background: C.amberSoft, color: "#7A4E10", padding: "3px 9px", borderRadius: 20, fontWeight: 600 }}>{emp.secondary}</span>}
        {canEditOrg && <button onClick={onEdit} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, color: C.navy, background: C.paper, border: "none", borderRadius: 20, padding: "3px 10px", cursor: "pointer" }}><Pencil size={12} /> Edit</button>}
      </div>
      <SectionLabel>Primary responsibilities</SectionLabel>
      <ul style={{ margin: "6px 0 18px", paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7 }}>{emp.resp.map((r,i) => <li key={i}>{r}</li>)}</ul>
      <SectionLabel>Task statistics</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, margin: "8px 0 18px" }}>
        <MiniStat label="Total" value={stats.total} /><MiniStat label="Completed" value={stats.completed} /><MiniStat label="Completion" value={`${rate}%`} />
      </div>
      <SectionLabel>Reporting structure</SectionLabel>
      <div style={{ fontSize: 13.5, margin: "8px 0 6px" }}>
        Reports to: {emp.sup && byId[emp.sup] ? <b onClick={() => setSelectedEmp(emp.sup)} style={{cursor:"pointer", textDecoration:"underline"}}>{byId[emp.sup].name}</b> : <span style={{color:C.slate}}>— (top of org)</span>}
      </div>
      {reports.length > 0 && (
        <div style={{ fontSize: 13.5 }}>Direct reports:
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            {reports.map(r => <span key={r.id} onClick={() => setSelectedEmp(r.id)} style={{ fontSize: 12, background: C.paper, padding: "4px 10px", borderRadius: 20, cursor: "pointer" }}>{r.name}</span>)}
          </div>
        </div>
      )}
    </ModalShell>
  );
}

function MiniStat({ label, value }) {
  return <div style={{ background: C.paper, borderRadius: 8, padding: "8px 10px", textAlign: "center" }}><div style={{ fontSize: 17, fontWeight: 700 }}>{value}</div><div style={{ fontSize: 10.5, color: C.slate }}>{label}</div></div>;
}

/* ---------------------------------------------------------------
   TASKS
----------------------------------------------------------------*/
function exportTaskReport(employees, tasks) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["Employee", "Department", "Completed Tasks", "Total Tasks", "Completion %"]];
  employees.forEach(e => {
    const empTasks = tasks.filter(t => t.assignee === e.id);
    const completed = empTasks.filter(t => t.status === "Completed").length;
    const pct = empTasks.length ? Math.round((completed / empTasks.length) * 100) : 0;
    rows.push([e.name, deptById[e.dept]?.name || e.dept, completed, empTasks.length, `${pct}%`]);
  });
  rows.push([]);
  rows.push(["Completed Task Log"]);
  rows.push(["Employee", "Task", "Department", "Due Date"]);
  const byId = Object.fromEntries(employees.map(e => [e.id, e]));
  tasks.filter(t => t.status === "Completed").forEach(t => {
    rows.push([byId[t.assignee]?.name || t.assignee || "Unassigned", t.title, deptById[t.dept]?.name || t.dept, t.due]);
  });
  const csv = rows.map(r => r.map(esc).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `motherbase-task-report-${today()}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function Tasks({ tasks, taskView, setTaskView, setTaskStatus, viewerEmp, canCreate, setShowAddTask, setTaskDetail }) {
  const { employees } = useEmp();
  return (
    <div>
      <PageHeader eyebrow="Task Management" title="Tasks" actions={
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <ToggleBtn active={taskView==="kanban"} onClick={()=>setTaskView("kanban")} icon={KanbanSquare} label="Kanban" />
          <ToggleBtn active={taskView==="list"} onClick={()=>setTaskView("list")} icon={Table2} label="List" />
          <ToggleBtn active={taskView==="calendar"} onClick={()=>setTaskView("calendar")} icon={CalendarDays} label="Calendar" />
          {canCreate && (
            <button onClick={() => exportTaskReport(employees, tasks)} style={{ display: "flex", alignItems: "center", gap: 6, background: C.card, border: `1px solid ${C.line}`, color: C.ink, borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", marginLeft: 6 }}>
              Export Report
            </button>
          )}
          {canCreate && <button onClick={() => setShowAddTask(true)} style={{ display: "flex", alignItems: "center", gap: 6, background: C.amber, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}><Plus size={15} /> Add Task</button>}
        </div>
      } />
      {!canCreate && <div style={{ fontSize: 12.5, color: C.slate, marginBottom: 14 }}>Viewing as {viewerEmp.name} ({ROLE_LABEL[viewerEmp.role]}) — you can update status and progress on your own tasks. Completion needs your supervisor's sign-off.</div>}
      {taskView === "kanban" && <KanbanView tasks={tasks} setTaskStatus={setTaskStatus} viewerEmp={viewerEmp} setTaskDetail={setTaskDetail} />}
      {taskView === "list" && <ListView tasks={tasks} setTaskDetail={setTaskDetail} />}
      {taskView === "calendar" && <CalendarView tasks={tasks} setTaskDetail={setTaskDetail} />}
    </div>
  );
}

function KanbanView({ tasks, setTaskStatus, viewerEmp, setTaskDetail }) {
  const canAdvance = (t) => viewerEmp.role !== "employee" || t.assignee === viewerEmp.id;
  return (
    <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 8 }}>
      {COLUMNS.map(col => {
        const items = tasks.filter(t => t.status === col);
        return (
          <div key={col} style={{ minWidth: 250, flex: "0 0 250px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: 0.2 }}>{col}</span>
              <span style={{ fontSize: 11.5, color: C.slate, background: C.card, border: `1px solid ${C.line}`, borderRadius: 20, padding: "1px 8px" }}>{items.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map(t => (
                <TaskCard key={t.id} t={t} onOpen={() => setTaskDetail(t.id)}>
                  {canAdvance(t) && col !== "Completed" && (
                    <select value={t.status} onChange={e => setTaskStatus(t.id, e.target.value)} onClick={e => e.stopPropagation()}
                      style={{ fontSize: 10.5, marginTop: 8, border: `1px solid ${C.line}`, borderRadius: 6, padding: "3px 5px", width: "100%" }}>
                      {COLUMNS.map(c => <option key={c} value={c}>{c === "Completed" ? "Submit for sign-off →" : `Move to ${c}`}</option>)}
                    </select>
                  )}
                </TaskCard>
              ))}
              {items.length === 0 && <div style={{ fontSize: 12, color: C.slate, padding: "10px 4px" }}>No tasks.</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function priorityCardColors(t) {
  if (t.status === "Completed") return { bg: C.sageSoft, border: C.sage };
  if (t.priority === "High") return { bg: C.coralSoft, border: C.coral };
  if (t.priority === "Medium") return { bg: C.blueSoft, border: C.blue };
  return { bg: C.yellowSoft, border: C.yellow }; // Low
}

function TaskCard({ t, children, onOpen }) {
  const { byId, onlineIds } = useEmp();
  const meta = statusMeta(t);
  const emp = byId[t.assignee] || { name: "Unassigned" };
  const subtaskProgress = t.subtasks?.length ? `${t.subtasks.filter(s=>s.done).length}/${t.subtasks.length}` : null;
  const pc = priorityCardColors(t);
  return (
    <div onClick={onOpen} style={{ background: pc.bg, border: `1.5px solid ${pc.border}`, borderRadius: 10, padding: 12, cursor: "pointer" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: priColor(t.priority) }}>{t.priority}</span>
        {t.recurring && <span title="Recurring"><Repeat size={12} color={C.slate} /></span>}
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 6, lineHeight: 1.3 }}>{t.title}</div>
      <div style={{ fontSize: 11, color: C.slate, marginBottom: 8 }}>{deptById[t.dept]?.name}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <Avatar name={emp.name} size={20} online={onlineIds?.has(t.assignee)} /><span style={{ fontSize: 11.5 }}>{emp.name}</span>
      </div>
      <div style={{ height: 4, background: C.paper, borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
        <div style={{ height: "100%", width: `${t.progress}%`, background: C.amber }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: meta.color, fontWeight: 600 }}>
        <span>{meta.label} · {t.due}</span>{subtaskProgress && <span style={{ color: C.slate, fontWeight: 500 }}>{subtaskProgress} subtasks</span>}
      </div>
      {children}
    </div>
  );
}

function ListView({ tasks, setTaskDetail }) {
  const { byId } = useEmp();
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
        <thead><tr style={{ background: C.paper, textAlign: "left" }}>{["Task","Employee","Department","Priority","Due","Status"].map(h => <th key={h} style={{ padding: "10px 16px", fontSize: 11.5, color: C.slate, fontWeight: 600 }}>{h}</th>)}</tr></thead>
        <tbody>
          {tasks.map(t => {
            const meta = statusMeta(t);
            return (
              <tr key={t.id} onClick={() => setTaskDetail(t.id)} style={{ borderTop: `1px solid ${C.line}`, cursor: "pointer" }}>
                <td style={{ padding: "10px 16px", fontWeight: 600 }}>{t.title}</td>
                <td style={{ padding: "10px 16px" }}>{byId[t.assignee]?.name || "Unassigned"}</td>
                <td style={{ padding: "10px 16px" }}><DeptTag id={t.dept} /></td>
                <td style={{ padding: "10px 16px", color: priColor(t.priority), fontWeight: 600 }}>{t.priority}</td>
                <td style={{ padding: "10px 16px", color: meta.color, fontWeight: 600 }}>{t.due}</td>
                <td style={{ padding: "10px 16px", color: C.slate }}>{t.status}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CalendarView({ tasks, setTaskDetail }) {
  const { byId } = useEmp();
  const grouped = {};
  tasks.forEach(t => { grouped[t.due] = grouped[t.due] || []; grouped[t.due].push(t); });
  const dates = Object.keys(grouped).sort();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {dates.length === 0 && <Empty text="No tasks scheduled." />}
      {dates.map(dt => (
        <div key={dt} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8, color: dt < today() ? C.coral : dt === today() ? C.amber : C.ink }}>{dt} {dt === today() && "· Today"}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {grouped[dt].map(t => (
              <div key={t.id} onClick={() => setTaskDetail(t.id)} style={{ display: "flex", gap: 10, fontSize: 13, cursor: "pointer" }}>
                <span style={{ fontWeight: 600, color: priColor(t.priority) }}>{t.priority}</span><span>{t.title}</span><span style={{ color: C.slate }}>— {byId[t.assignee]?.name || "Unassigned"}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CommentBubble({ c, byId, small }) {
  return (
    <div style={{ display: "flex", gap: 9 }}>
      <Avatar name={byId[c.author]?.name || c.author} size={small ? 22 : 26} />
      <div style={{ flex: 1, background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: "7px 10px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
          <span style={{ fontSize: small ? 11 : 12, fontWeight: 700 }}>{byId[c.author]?.name || c.author}</span>
          <span style={{ fontSize: 10.5, color: C.slate }}>{c.time}</span>
        </div>
        <div style={{ fontSize: small ? 12 : 13 }}>{c.text}</div>
      </div>
    </div>
  );
}

function TaskDetailModal({ task, onClose, addComment, viewerEmp, setTaskStatus, updateTask, refetchTasks }) {
  const { byId, employees } = useEmp();
  const [draft, setDraft] = useState("");
  const [signoffNote, setSignoffNote] = useState("");
  const [showEdit, setShowEdit] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  if (!task) return null;
  const emp = byId[task.assignee] || { name: "Unassigned" };
  const sup = byId[task.supervisor] || { name: "—" };
  const comments = task.comments || [];
  const topLevel = comments.filter(c => !c.parent);
  const repliesOf = (id) => comments.filter(c => c.parent === id);
  const submitComment = () => { if (!draft.trim()) return; addComment(task.id, draft.trim()); setDraft(""); };
  const submitReply = (parentId) => { if (!replyDraft.trim()) return; addComment(task.id, replyDraft.trim(), parentId); setReplyDraft(""); setReplyingTo(null); };

  const canEditTask = viewerEmp.role !== "employee";

  // The approver is whoever isn't the assignee and isn't a plain employee — i.e. the
  // supervisor, a manager up the chain, or an exec/admin reviewing someone else's work.
  const isApprover = task.status === "For Review" && viewerEmp.id !== task.assignee && viewerEmp.role !== "employee";
  const approve = () => {
    if (signoffNote.trim()) addComment(task.id, `Approved by ${viewerEmp.name}: ${signoffNote.trim()}`);
    setTaskStatus(task.id, "Completed");
    onClose();
  };
  const sendBack = () => {
    if (!signoffNote.trim()) { alert("Add a short note explaining what still needs to be done before sending it back."); return; }
    addComment(task.id, `Sent back by ${viewerEmp.name}: ${signoffNote.trim()}`);
    setTaskStatus(task.id, "In Progress");
    onClose();
  };

  const uploadFile = async (file) => {
    setUploading(true);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${task.id}/${Date.now()}-${safeName}`;
    const { error: upErr } = await supabase.storage.from("task-attachments").upload(path, file);
    if (upErr) { alert(upErr.message); setUploading(false); return; }
    await supabase.from("task_attachments").insert({ task_id: task.id, file_name: file.name, file_path: path, uploaded_by: viewerEmp.id });
    await refetchTasks();
    setUploading(false);
  };

  const recurrenceLabel = !task.recurring ? "One-time"
    : task.recurring === "Custom" ? `Custom — every ${task.recurringCustomDays || "?"} day(s)`
    : task.recurring;

  return (
    <ModalShell onClose={onClose} width={560}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div><div style={{ fontSize: 11, fontWeight: 700, color: priColor(task.priority), marginBottom: 4 }}>{task.priority} PRIORITY</div><div className="mb-display" style={{ fontSize: 19, fontWeight: 600 }}>{task.title}</div></div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <DeptTag id={task.dept} />
          {canEditTask && <button onClick={() => setShowEdit(true)} title="Edit task" style={{ background: "none", border: "none", cursor: "pointer", color: C.slate }}><Pencil size={16} /></button>}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, margin: "16px 0" }}>
        <Field label="Assigned to" value={emp.name} /><Field label="Supervisor" value={sup.name} />
        <Field label="Due date" value={task.due} /><Field label="Status" value={task.status} />
        <Field label="Category" value={task.category} /><Field label="Recurrence" value={recurrenceLabel} />
        {task.backup && <Field label="Backup assignee" value={byId[task.backup]?.name || "—"} />}
        <Field label="Created by" value={byId[task.createdBy]?.name || "—"} />
      </div>
      <SectionLabel>Progress</SectionLabel>
      <div style={{ height: 8, background: C.paper, borderRadius: 4, overflow: "hidden", margin: "8px 0 18px" }}><div style={{ height: "100%", width: `${task.progress}%`, background: C.amber }} /></div>
      {task.subtasks?.length > 0 && (
        <>
          <SectionLabel>Subtasks — {task.subtasks.filter(s=>s.done).length}/{task.subtasks.length} completed</SectionLabel>
          <div style={{ margin: "8px 0 18px" }}>{task.subtasks.map(s => <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, padding: "4px 0" }}><input type="checkbox" checked={s.done} readOnly /><span style={{ textDecoration: s.done ? "line-through" : "none", color: s.done ? C.slate : C.ink }}>{s.title}</span></div>)}</div>
        </>
      )}
      {task.needsSignoff && task.status !== "Completed" && !isApprover && (
        <div style={{ marginBottom: 14, fontSize: 12, color: C.slate, background: C.paper, borderRadius: 8, padding: 10 }}><ShieldCheck size={13} style={{ verticalAlign: -2, marginRight: 5 }} /> This task requires sign-off from {sup.name} before it counts as complete.</div>
      )}
      {isApprover && (
        <div style={{ marginBottom: 16, background: C.paper, borderRadius: 10, padding: 12 }}>
          <SectionLabel>Sign-off decision</SectionLabel>
          <div style={{ fontSize: 12, color: C.slate, margin: "6px 0 10px" }}>{emp.name} submitted this for your review. Approve it if it's genuinely done, or send it back if it isn't — a note is required when sending back.</div>
          <textarea placeholder="Note for the assignee (required if sending back)" value={signoffNote} onChange={e=>setSignoffNote(e.target.value)}
            style={{ ...inputStyle, minHeight: 60, marginBottom: 10, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={approve} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: C.sage, color: "#fff", border: "none", borderRadius: 8, padding: "9px 0", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
              <CheckCircle2 size={14} /> Approve
            </button>
            <button onClick={sendBack} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: C.coral, color: "#fff", border: "none", borderRadius: 8, padding: "9px 0", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
              <Undo2 size={14} /> Send back — not complete
            </button>
          </div>
        </div>
      )}

      <SectionLabel>Files — {task.attachments?.length || 0}</SectionLabel>
      <div style={{ margin: "8px 0 10px", display: "flex", flexDirection: "column", gap: 6 }}>
        {(task.attachments || []).length === 0 && <div style={{ fontSize: 12.5, color: C.slate }}>No files attached yet.</div>}
        {(task.attachments || []).map(a => {
          const { data } = supabase.storage.from("task-attachments").getPublicUrl(a.path);
          return (
            <a key={a.id} href={data?.publicUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: C.navy, display: "flex", justifyContent: "space-between", background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 10px", textDecoration: "none" }}>
              <span>{a.name}</span><span style={{ color: C.slate, fontSize: 11 }}>{byId[a.uploadedBy]?.name || a.uploadedBy} · {a.time}</span>
            </a>
          );
        })}
      </div>
      <label style={{ display: "inline-block", fontSize: 12.5, fontWeight: 600, color: C.navy, background: C.paper, border: `1px solid ${C.line}`, borderRadius: 8, padding: "7px 12px", cursor: "pointer", marginBottom: 18 }}>
        {uploading ? "Uploading…" : "+ Attach a file"}
        <input type="file" disabled={uploading} style={{ display: "none" }} onChange={async (e) => { const f = e.target.files?.[0]; if (f) await uploadFile(f); e.target.value = ""; }} />
      </label>

      <SectionLabel>Comments &amp; questions — {comments.length}</SectionLabel>
      <div style={{ margin: "10px 0 14px", display: "flex", flexDirection: "column", gap: 10, maxHeight: 260, overflowY: "auto" }}>
        {comments.length === 0 && <div style={{ fontSize: 12.5, color: C.slate }}>No comments yet.</div>}
        {topLevel.map((c) => (
          <div key={c.id ?? c.time}>
            <CommentBubble c={c} byId={byId} />
            {c.id && (
              <button onClick={() => setReplyingTo(replyingTo === c.id ? null : c.id)} style={{ fontSize: 11, color: C.slate, background: "none", border: "none", cursor: "pointer", marginLeft: 35, marginTop: 3, padding: 0 }}>
                Reply
              </button>
            )}
            {repliesOf(c.id).map(r => (
              <div key={r.id} style={{ marginLeft: 35, marginTop: 6 }}><CommentBubble c={r} byId={byId} small /></div>
            ))}
            {replyingTo === c.id && (
              <div style={{ marginLeft: 35, marginTop: 6, display: "flex", gap: 6 }}>
                <input value={replyDraft} onChange={e=>setReplyDraft(e.target.value)} placeholder="Write a reply…" style={{ ...inputStyle, flex: 1 }} />
                <button onClick={() => submitReply(c.id)} style={{ background: C.amber, color: "#fff", border: "none", borderRadius: 8, padding: "0 12px", fontSize: 12, cursor: "pointer" }}>Send</button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <Avatar name={viewerEmp.name} size={26} />
        <div style={{ flex: 1 }}>
          <textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder={`Leave a note or ask a question as ${viewerEmp.name}…`} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
          <button onClick={submitComment} style={{ marginTop: 6, background: C.amber, color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Add Comment</button>
        </div>
      </div>
      {showEdit && (
        <EditTaskModal task={task} onClose={() => setShowEdit(false)} onSave={(patch) => { updateTask(task.id, patch); setShowEdit(false); }} />
      )}
    </ModalShell>
  );
}

function EditTaskModal({ task, onClose, onSave }) {
  const { employees, byId } = useEmp();
  const [title, setTitle] = useState(task.title);
  const [assignee, setAssignee] = useState(task.assignee);
  const [priority, setPriority] = useState(task.priority);
  const [due, setDue] = useState(task.due || today());
  const [category, setCategory] = useState(task.category || "");
  const [recurring, setRecurring] = useState(task.recurring || "");
  const [customDays, setCustomDays] = useState(task.recurringCustomDays || 7);

  const submit = () => {
    if (!title.trim() || !assignee) return;
    const assigneeEmp = byId[assignee];
    onSave({
      title: title.trim(), assignee_id: assignee, dept_id: assigneeEmp.dept,
      supervisor_id: assigneeEmp.sup || task.supervisor, priority, due_date: due, category,
      recurring: recurring || null, recurring_custom_days: recurring === "Custom" ? (Number(customDays) || 7) : null,
    });
  };

  return (
    <ModalShell onClose={onClose} width={460}>
      <div className="mb-display" style={{ fontSize: 19, fontWeight: 600, marginBottom: 16 }}>Edit Task</div>
      <FormRow label="Task title"><input value={title} onChange={e=>setTitle(e.target.value)} style={inputStyle} /></FormRow>
      <FormRow label="Assign to">
        <select value={assignee} onChange={e=>setAssignee(e.target.value)} style={inputStyle}>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name} — {e.position}</option>)}
        </select>
      </FormRow>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <FormRow label="Priority"><select value={priority} onChange={e=>setPriority(e.target.value)} style={inputStyle}><option>High</option><option>Medium</option><option>Low</option></select></FormRow>
        <FormRow label="Due date"><input type="date" value={due} onChange={e=>setDue(e.target.value)} style={inputStyle} /></FormRow>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <FormRow label="Category"><input value={category} onChange={e=>setCategory(e.target.value)} style={inputStyle} /></FormRow>
        <FormRow label="Recurring?">
          <select value={recurring} onChange={e=>setRecurring(e.target.value)} style={inputStyle}>
            <option value="">One-time</option><option>Daily</option><option>Weekly</option><option>Biweekly</option><option>Monthly</option><option>Quarterly</option><option>Custom</option>
          </select>
        </FormRow>
      </div>
      {recurring === "Custom" && (
        <FormRow label="Repeat every N days"><input type="number" min={1} value={customDays} onChange={e=>setCustomDays(e.target.value)} style={inputStyle} /></FormRow>
      )}
      <button onClick={submit} style={{ marginTop: 14, width: "100%", background: C.amber, color: "#fff", border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Save Changes</button>
    </ModalShell>
  );
}

function Field({ label, value }) {
  return <div><div style={{ fontSize: 10.5, color: C.slate, marginBottom: 2 }}>{label}</div><div style={{ fontSize: 13.5, fontWeight: 600 }}>{value}</div></div>;
}

function AddTaskModal({ onClose, onCreate, onAttach, createdBy }) {
  const { employees, byId } = useEmp();
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState(employees[0]?.id || "");
  const [priority, setPriority] = useState("Medium");
  const [due, setDue] = useState(today());
  const [category, setCategory] = useState("General");
  const [recurring, setRecurring] = useState("");
  const [customDays, setCustomDays] = useState(7);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim() || !assignee || saving) return;
    setSaving(true);
    const assigneeEmp = byId[assignee];
    const taskId = await onCreate({ title, assignee, dept: assigneeEmp.dept, supervisor: assigneeEmp.sup || createdBy, priority, status: "Backlog", due, progress: 0, category, recurring: recurring || null, recurringCustomDays: recurring === "Custom" ? Number(customDays) || 7 : null, createdBy, needsSignoff: true });
    if (taskId && file) await onAttach(taskId, file);
    setSaving(false);
    onClose();
  };

  return (
    <ModalShell onClose={onClose} width={460}>
      <div className="mb-display" style={{ fontSize: 19, fontWeight: 600, marginBottom: 16 }}>Create Task</div>
      <FormRow label="Task title"><input value={title} onChange={e=>setTitle(e.target.value)} style={inputStyle} /></FormRow>
      <FormRow label="Assign to">
        <select value={assignee} onChange={e=>setAssignee(e.target.value)} style={inputStyle}>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name} — {e.position}</option>)}
        </select>
      </FormRow>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <FormRow label="Priority"><select value={priority} onChange={e=>setPriority(e.target.value)} style={inputStyle}><option>High</option><option>Medium</option><option>Low</option></select></FormRow>
        <FormRow label="Due date"><input type="date" value={due} onChange={e=>setDue(e.target.value)} style={inputStyle} /></FormRow>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <FormRow label="Category"><input value={category} onChange={e=>setCategory(e.target.value)} style={inputStyle} /></FormRow>
        <FormRow label="Recurring?">
          <select value={recurring} onChange={e=>setRecurring(e.target.value)} style={inputStyle}>
            <option value="">One-time</option><option>Daily</option><option>Weekly</option><option>Biweekly</option><option>Monthly</option><option>Quarterly</option><option>Custom</option>
          </select>
        </FormRow>
      </div>
      {recurring === "Custom" && (
        <FormRow label="Repeat every N days">
          <input type="number" min={1} value={customDays} onChange={e=>setCustomDays(e.target.value)} style={inputStyle} />
        </FormRow>
      )}
      <FormRow label="Attach a file (optional)">
        <input type="file" onChange={e => setFile(e.target.files?.[0] || null)} style={{ fontSize: 12.5 }} />
      </FormRow>
      <button onClick={submit} disabled={saving} style={{ marginTop: 14, width: "100%", background: C.amber, color: "#fff", border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
        {saving ? "Creating…" : "Create Task"}
      </button>
    </ModalShell>
  );
}

function FormRow({ label, children }) {
  return <div style={{ marginBottom: 12 }}><div style={{ fontSize: 11.5, color: C.slate, marginBottom: 4 }}>{label}</div>{children}</div>;
}
const inputStyle = { width: "100%", border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 10px", fontSize: 13.5, fontFamily: "inherit" };

function Notifications({ tasks }) {
  const items = [
    ...tasks.filter(t => statusMeta(t).label === "Overdue").map(t => ({ type: "overdue", t })),
    ...tasks.filter(t => statusMeta(t).label === "Due today").map(t => ({ type: "due", t })),
    ...tasks.filter(t => t.status === "For Review").map(t => ({ type: "review", t })),
  ];
  const copy = { overdue: (t) => `"${t.title}" is overdue`, due: (t) => `"${t.title}" is due today`, review: (t) => `"${t.title}" is waiting on your sign-off` };
  const iconFor = { overdue: CircleAlert, due: Clock, review: ShieldCheck };
  const colorFor = { overdue: C.coral, due: C.amber, review: C.slate };
  return (
    <div>
      <PageHeader eyebrow="In-app alerts" title="Notifications" />
      <Panel title={`${items.length} notification${items.length===1?"":"s"}`}>
        {items.length === 0 && <Empty text="You're all caught up." />}
        {items.map((n, i) => { const Icon = iconFor[n.type]; return (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.line}` }}>
            <Icon size={16} color={colorFor[n.type]} /><div style={{ fontSize: 13.5, flex: 1 }}>{copy[n.type](n.t)}</div><span style={{ fontSize: 11.5, color: C.slate }}>{n.t.due}</span>
          </div>
        ); })}
      </Panel>
    </div>
  );
}

function ChangePasswordPanel() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    setError(""); setOk(false);
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) setError(error.message);
    else { setOk(true); setPassword(""); setConfirm(""); }
  };
  return (
    <Panel title="Change your password" style={{ marginTop: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, maxWidth: 420 }}>
        <FormRow label="New password"><input type="password" value={password} onChange={e=>setPassword(e.target.value)} style={inputStyle} /></FormRow>
        <FormRow label="Confirm password"><input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} style={inputStyle} /></FormRow>
      </div>
      {error && <div style={{ color: C.coral, fontSize: 12.5, marginBottom: 8 }}>{error}</div>}
      {ok && <div style={{ color: C.sage, fontSize: 12.5, marginBottom: 8 }}>Password updated.</div>}
      <button onClick={submit} disabled={loading} style={{ background: C.amber, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
        {loading ? "Saving…" : "Update password"}
      </button>
    </Panel>
  );
}

function SettingsPage({ isAdmin, dark, setDark }) {
  const perms = [
    ["View Organization", true, true, true, true],
    ["Edit Organization / Employees", true, true, true, false],
    ["Create Task", true, true, true, false],
    ["Assign / Reassign Task", true, true, true, false],
    ["Approve Task Completion", true, true, true, false],
    ["View All Tasks", true, true, false, false],
    ["View Department Tasks", true, true, true, false],
    ["View Own Tasks", true, true, true, true],
    ["Manage Permissions", true, false, false, false],
  ];
  return (
    <div>
      <PageHeader eyebrow="Administration" title="Settings" />
      <Panel title="Appearance">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", maxWidth: 420 }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>Dark mode</div>
            <div style={{ fontSize: 11.5, color: C.slate }}>Switch the whole app to a dark color scheme.</div>
          </div>
          <button onClick={() => setDark(d => !d)} style={{
            width: 46, height: 26, borderRadius: 20, border: "none", cursor: "pointer",
            background: dark ? C.amber : C.line, position: "relative", flexShrink: 0,
          }}>
            <span style={{ position: "absolute", top: 3, left: dark ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.15s" }} />
          </button>
        </div>
      </Panel>
      <ChangePasswordPanel />
      {!isAdmin && <div style={{ fontSize: 13, color: C.slate, margin: "16px 0 14px" }}>Only Super Admin can modify departments/permissions below. You're viewing read-only.</div>}
      <Panel title="Departments" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{DEPARTMENTS.map(dep => <span key={dep.id} style={{ fontSize: 12.5, fontWeight: 600, color: dep.color, background: dep.color+"18", padding: "5px 12px", borderRadius: 20 }}>{dep.name}</span>)}</div>
      </Panel>
      <Panel title="Permission matrix" style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, color: C.slate, marginBottom: 10 }}>Note: editing org/employee records is restricted to Jose Paulo, Andrea, Maria, and Julian specifically (see Organization page).</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead><tr><th style={{ textAlign: "left", padding: "6px 8px", color: C.slate, fontSize: 11 }}>Capability</th>{["Super Admin","Executive","Manager","Employee"].map(h => <th key={h} style={{ padding: "6px 8px", color: C.slate, fontSize: 11 }}>{h}</th>)}</tr></thead>
          <tbody>{perms.map(([label, ...vals]) => (
            <tr key={label} style={{ borderTop: `1px solid ${C.line}` }}>
              <td style={{ padding: "7px 8px", fontWeight: 500 }}>{label}</td>
              {vals.map((v,i) => <td key={i} style={{ textAlign: "center", padding: "7px 8px" }}>{v ? <CheckCircle2 size={14} color={C.sage} /> : <span style={{ color: C.line }}>—</span>}</td>)}
            </tr>
          ))}</tbody>
        </table>
      </Panel>
    </div>
  );
}

/* ---------------------------------------------------------------
   SHARED UI PRIMITIVES
----------------------------------------------------------------*/
function PageHeader({ eyebrow, title, actions }) {
  return <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}><div><div style={{ fontSize: 11.5, color: C.slate, fontWeight: 600, marginBottom: 3 }}>{eyebrow}</div><div className="mb-display" style={{ fontSize: 26, fontWeight: 600 }}>{title}</div></div>{actions}</div>;
}
function StatCard({ label, value, sub, accent }) {
  return <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: "14px 16px" }}><div style={{ fontSize: 11.5, color: C.slate, marginBottom: 4 }}>{label}</div><div className="mb-display" style={{ fontSize: 26, fontWeight: 600, color: accent || C.ink }}>{value}</div><div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>{sub}</div></div>;
}
function Panel({ title, children, style }) {
  return <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 18, ...style }}><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{title}</div>{children}</div>;
}
function SectionLabel({ children }) { return <div style={{ fontSize: 11, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 14 }}>{children}</div>; }
function ToggleBtn({ active, onClick, icon: Icon, label }) {
  return <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: `1px solid ${active ? C.navy : C.line}`, background: active ? C.navy : C.card, color: active ? "#fff" : C.ink, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}><Icon size={14} /> {label}</button>;
}
function SearchBar({ value, onChange, placeholder }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: "8px 12px", marginBottom: 16, maxWidth: 420 }}><Search size={15} color={C.slate} /><input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ border: "none", outline: "none", fontSize: 13.5, flex: 1, fontFamily: "inherit" }} /></div>;
}
function Avatar({ name, size = 32, online }) {
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <div style={{ width: size, height: size, borderRadius: size, background: C.navySoft, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size*0.36, fontWeight: 700 }}>{initials(name)}</div>
      {online && <span title="Online" style={{ position: "absolute", bottom: -1, right: -1, width: Math.max(8, size*0.28), height: Math.max(8, size*0.28), borderRadius: "50%", background: C.sage, border: `2px solid ${C.card}` }} />}
    </div>
  );
}
function Empty({ text }) { return <div style={{ fontSize: 13, color: C.slate, padding: "10px 0" }}>{text}</div>; }
function ModalShell({ children, onClose, width = 500 }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(20,22,35,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "60px 20px", zIndex: 50, overflowY: "auto" }}>
      <div onClick={e => e.stopPropagation()} className="mb-body" style={{ background: C.paper, borderRadius: 16, padding: 26, width, maxWidth: "100%", position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer", color: C.slate }}><X size={18} /></button>
        {children}
      </div>
    </div>
  );
}
