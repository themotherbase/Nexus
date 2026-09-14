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
