import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import stripePkg from 'stripe';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, '..')));

const DATA = path.join(__dirname, '..', 'data');
const CFG = path.join(DATA, 'config.json');
const LPATH = path.join(DATA, 'listings.json');
const VPATH = path.join(DATA, 'vendors.json');
const OPATH = path.join(DATA, 'orders.json');
const RPATH = path.join(DATA, 'reviews.json');
const BPATH = path.join(DATA, 'blog.json');

const DOMAIN = process.env.PUBLIC_URL || 'http://localhost:3000';

function read(p){ try{ return JSON.parse(fs.readFileSync(p,'utf8')) }catch{ return Array.isArray ? [] : {} } }
function write(p, d){ fs.writeFileSync(p, JSON.stringify(d, null, 2), 'utf8'); }

// --- Config public endpoint ---
app.get('/api/config', (req,res)=>{
  try { res.json(read(CFG)); } catch { res.json({}); }
});

// --- Public data ---
app.get('/api/categories', (req,res)=>{
  const cats = [...new Set(read(LPATH).map(l=>l.category))];
  res.json(cats);
});

app.get('/api/listings', (req,res)=>{
  const { q='', category='', featured, sort } = req.query;
  let items = read(LPATH);
  if(category) items = items.filter(i=>i.category.toLowerCase()===(category+'').toLowerCase());
  if(q) items = items.filter(i=> (i.title+i.description).toLowerCase().includes((q+'').toLowerCase()));
  if(featured) items = items.filter(i=> i.featured);
  if(sort==='popular') items = items.sort((a,b)=> (b.pop||0)-(a.pop||0));
  res.json({ items });
});

app.get('/api/listings/:id', (req,res)=>{
  const it = read(LPATH).find(i=>i.id===req.params.id);
  if(!it) return res.status(404).json({error:'Not found'});
  res.json(it);
});

app.get('/api/reviews', (req,res)=> res.json(read(RPATH)));
app.get('/api/blog', (req,res)=> res.json(read(BPATH)));

// --- Vendors ---
app.post('/api/vendors', (req,res)=>{
  const vendors = read(VPATH);
  const id = 'V' + Math.random().toString(36).slice(2,8).toUpperCase();
  const token = 'tok_' + id + '_' + Math.random().toString(36).slice(2,10);
  vendors.push({ vendorId:id, name:'Vendedor '+id, token });
  write(VPATH, vendors);
  res.json({ vendorId:id, token });
});

app.post('/api/listings', (req,res)=>{
  const auth = (req.headers.authorization||'').replace('Bearer ','').trim();
  const vendors = read(VPATH);
  const v = vendors.find(x=>x.token===auth);
  if(!v) return res.status(401).json({error:'Token inválido'});
  const { title, category, price, description } = req.body || {};
  if(!title || !category || !price) return res.status(400).json({error:'Campos obrigatórios'});
  const items = read(LPATH);
  const id = 'L' + Math.random().toString(36).slice(2,8).toUpperCase();
  const entry = { id, title, category, price:parseFloat(price), description, vendorId:v.vendorId, vendorName:v.name, featured:false, pop:0 };
  items.push(entry); write(LPATH, items);
  res.json({ id });
});

// --- Orders + Payments ---
function computeTotal(items){ return items.reduce((s,it)=> s + (parseFloat(it.price)||0) * (it.qty||1), 0); }

app.post('/api/order', (req,res)=>{
  const { email, name, items } = req.body || {};
  if(!email || !Array.isArray(items) || !items.length) return res.status(400).json({error:'Dados inválidos'});
  const orders = read(OPATH);
  const orderId = 'TEC-' + Math.random().toString(36).slice(2,10).toUpperCase();
  const total = computeTotal(items);
  orders.push({ orderId, email, name, items, total, status:'created', createdAt: Date.now() });
  write(OPATH, orders);
  res.json({ orderId });
});

// Stripe
const stripe = stripePkg(process.env.STRIPE_SECRET || '');
app.post('/api/create-checkout-session', async (req,res)=>{
  try{
    const { orderId } = req.body || {}; const orders = read(OPATH);
    const order = orders.find(o=>o.orderId===orderId);
    if(!order) return res.status(404).json({error:'Pedido não encontrado'});
    if(!process.env.STRIPE_SECRET) return res.status(400).json({error:'Config Stripe ausente'});
    const line_items = order.items.map(it => ({ price_data:{ currency:'brl', product_data:{ name: it.title }, unit_amount: Math.round(parseFloat(it.price)*100)}, quantity: it.qty||1 }));
    const session = await stripe.checkout.sessions.create({
      mode:'payment', line_items,
      success_url: `${DOMAIN}/checkout.html?success=true&order=${orderId}`,
      cancel_url: `${DOMAIN}/checkout.html?canceled=true&order=${orderId}`,
      metadata: { orderId }
    });
    res.json({ url: session.url });
  }catch(e){ res.status(500).json({error:e.message}) }
});

// Mercado Pago
app.post('/api/mp/create-preference', async (req,res)=>{
  try{
    const { orderId } = req.body || {}; const orders = read(OPATH);
    const order = orders.find(o=>o.orderId===orderId);
    if(!order) return res.status(404).json({error:'Pedido não encontrado'});
    if(!process.env.MP_ACCESS_TOKEN) return res.status(400).json({error:'MP_ACCESS_TOKEN ausente'});
    const items = order.items.map(it => ({ title: it.title, quantity: it.qty||1, currency_id:'BRL', unit_price: parseFloat(it.price) }));
    const pref = await axios.post('https://api.mercadopago.com/checkout/preferences', {
      items, back_urls:{ success:`${DOMAIN}/checkout.html?success=true&order=${orderId}`, failure:`${DOMAIN}/checkout.html?canceled=true&order=${orderId}` }, auto_return:'approved', metadata:{ orderId }
    }, { headers:{ Authorization: 'Bearer '+process.env.MP_ACCESS_TOKEN } });
    res.json({ init_point: pref.data.init_point || pref.data.sandbox_init_point });
  }catch(e){ res.status(500).json({error:e.message}) }
});

// PagSeguro
app.post('/api/pagseguro/create-order', async (req,res)=>{
  try{
    const { orderId } = req.body || {}; const orders = read(OPATH);
    const order = orders.find(o=>o.orderId===orderId);
    if(!order) return res.status(404).json({error:'Pedido não encontrado'});
    if(!process.env.PAGSEGURO_TOKEN) return res.status(400).json({error:'PAGSEGURO_TOKEN ausente'});
    const payload = {
      reference_id: orderId,
      customer: { name: order.name||'Cliente', email: order.email },
      items: order.items.map(it => ({ name: it.title, quantity: it.qty||1, unit_amount: Math.round(parseFloat(it.price)*100) })),
      charges: [{ amount: { value: Math.round(order.total*100), currency: 'BRL' } }]
    };
    const resp = await axios.post('https://api.pagseguro.com/orders', payload, { headers:{ Authorization: 'Bearer '+process.env.PAGSEGURO_TOKEN, 'Content-Type': 'application/json' } });
    const url = resp.data?.links?.find(l=>/payment/.test(l.rel))?.href || resp.data?.checkout_url || null;
    res.json({ checkout_url: url, data: resp.data });
  }catch(e){ res.status(500).json({error:e.message}) }
});

// --- Admin protected ---
function auth(req,res,next){
  const token=(req.headers.authorization||'').replace('Bearer ','').trim();
  if(!process.env.ADMIN_TOKEN || token!==process.env.ADMIN_TOKEN) return res.status(401).json({error:'Unauthorized'});
  next();
}

app.post('/api/admin/save-config', auth, (req,res)=>{
  try{
    const cfg = req.body||{};
    write(CFG, cfg);
    res.json({ ok:true });
  }catch(e){ res.status(500).json({error:e.message}) }
});

// CSV: title,category,price,description,vendorName
function parseCSV(text){
  const lines = text.split(/\r?\n/).filter(Boolean);
  if(!lines.length) return [];
  const header = lines[0].split(',').map(h=>h.trim());
  return lines.slice(1).map(line=>{
    const cols = line.split(','); const obj={};
    header.forEach((h,i)=> obj[h]= (cols[i]||'').trim());
    return obj;
  });
}

app.post('/api/admin/import-listings', auth, (req,res)=>{
  try{
    const { csv } = req.body||{}; if(!csv) return res.status(400).json({error:'CSV vazio'});
    const rows = parseCSV(csv);
    const items = read(LPATH);
    const vendors = read(VPATH);
    let count=0;
    for(const r of rows){
      if(!r.title || !r.category || !r.price) continue;
      const id = 'L' + Math.random().toString(36).slice(2,8).toUpperCase();
      const vname = r.vendorName || 'Vendedor';
      let vendor = vendors.find(v=>v.name===vname);
      if(!vendor){ vendor = { vendorId:'V'+Math.random().toString(36).slice(2,8).toUpperCase(), name:vname, token:'tok_'+Math.random().toString(36).slice(2,10) }; vendors.push(vendor); }
      items.push({ id, title:r.title, category:r.category, price:parseFloat(r.price), description:r.description||'', vendorId:vendor.vendorId, vendorName:vendor.name, featured:false, pop:0 });
      count++;
    }
    write(LPATH, items); write(VPATH, vendors);
    res.json({ ok:true, count });
  }catch(e){ res.status(500).json({error:e.message}) }
});

app.get('/health', (_,res)=>res.json({ok:true}));
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log('TEC Market PLUS on http://localhost:'+PORT));
