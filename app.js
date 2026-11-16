const DB_NAME = "ugly-baker-local";
const DB_VERSION = 2;
const STORE_NAMES = ["customers", "orders", "templates", "settings", "products", "ingredients", "recipes"];
const $ = (id) => document.getElementById(id);
let db;
let pendingBackup = null;

const DEFAULT_TEMPLATES = [
  {id:"tpl-received", name:"Order received", text:"Hi {name}! Thanks for your order with {bakery}. We've received your order ({order}: {items}) and will keep you updated. 🍞"},
  {id:"tpl-preparing", name:"Preparing", text:"Hi {name}! Your {bakery} order is now being prepared. We'll let you know when it's ready. 🍞"},
  {id:"tpl-ready", name:"Ready for collection", text:"Good news, {name}! Your {bakery} order ({order}) is ready for collection. Looking forward to seeing you!"},
  {id:"tpl-dispatched", name:"Dispatched", text:"Hi {name}! Your {bakery} order ({order}) has been dispatched. Thank you for supporting our little bakery!"},
  {id:"tpl-thanks", name:"Thank you", text:"Thanks so much for your order, {name}! We hope you enjoy your bread. ❤️"}
];

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      for (const name of STORE_NAMES) if (!d.objectStoreNames.contains(name)) d.createObjectStore(name, {keyPath:"id"});
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function store(name, mode="readonly") { return db.transaction(name, mode).objectStore(name); }
function all(name) { return new Promise((resolve,reject)=>{const r=store(name).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function put(name, value) { return new Promise((resolve,reject)=>{const r=store(name,"readwrite").put(value);r.onsuccess=()=>resolve(value);r.onerror=()=>reject(r.error);});}
function remove(name,id) { return new Promise((resolve,reject)=>{const r=store(name,"readwrite").delete(id);r.onsuccess=resolve;r.onerror=()=>reject(r.error);});}
function clear(name) { return new Promise((resolve,reject)=>{const r=store(name,"readwrite").clear();r.onsuccess=resolve;r.onerror=()=>reject(r.error);});}
function uid(prefix="") { return prefix + (crypto.randomUUID ? crypto.randomUUID() : Date.now()+"-"+Math.random().toString(16).slice(2)); }
function esc(v="") { return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function toast(msg) { const el=$("toast");el.textContent=msg;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2800); }
function dateText(value) { if(!value)return "No date set"; return new Date(value+"T00:00:00").toLocaleDateString("en-ZA",{day:"numeric",month:"short",year:"numeric"}); }
function money(v) { return v ? "R"+Number(v).toFixed(2) : ""; }
function normalisePhone(phone) {
  let p=String(phone||"").trim().replace(/[^\d+]/g,"");
  if(p.startsWith("00"))p="+"+p.slice(2);
  if(p.startsWith("0"))p="+27"+p.slice(1);
  if(p.startsWith("27"))p="+"+p;
  return p.replace(/\D/g,"");
}
function showView(name) {
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.view===name));
  document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id==="view-"+name));
  if(name==="dashboard")renderDashboard();
  if(name==="orders")renderOrders();
  if(name==="customers")renderCustomers();
  if(name==="products")renderProducts();
  if(name==="costs")renderIngredients();
  if(name==="messages")renderMessages();
}
function openDialog(id){$(id).showModal();}
function closeDialog(id){$(id).close();}
function customerById(id, customers){return customers.find(c=>c.id===id);}
function statusClass(s){return String(s||"").toLowerCase().replace(/\s+/g,"-");}

async function renderDashboard(){
  const [orders,customers]=await Promise.all([all("orders"),all("customers")]);
  const active=orders.filter(o=>!["Completed","Cancelled"].includes(o.status));
  $("stat-open").textContent=active.length;
  $("stat-preparing").textContent=orders.filter(o=>o.status==="Preparing").length;
  $("stat-ready").textContent=orders.filter(o=>o.status==="Ready").length;
  $("stat-customers").textContent=customers.length;
  const latest=orders.sort((a,b)=>(b.updatedAt||"").localeCompare(a.updatedAt||"")).slice(0,5);
  if(!latest.length){$("recent-orders").className="empty-state";$("recent-orders").textContent="No orders yet. Add your first order to get started.";return;}
  $("recent-orders").className="record-list";
  $("recent-orders").innerHTML=latest.map(o=>{const c=customerById(o.customerId,customers);return `<div class="record"><div class="record-main"><div class="record-title">${esc(c?.name||"Unknown customer")} · ${esc(o.items)}</div><div class="record-sub">${esc(o.orderNo||"")} · ${dateText(o.date)} · ${money(o.total)}</div></div><span class="status ${statusClass(o.status)}">${esc(o.status)}</span></div>`}).join("");
}
async function renderOrders(){
  const [orders,customers]=await Promise.all([all("orders"),all("customers")]);
  const q=$("order-search").value.toLowerCase(),filter=$("order-filter").value;
  const list=orders.sort((a,b)=>(b.updatedAt||"").localeCompare(a.updatedAt||"")).filter(o=>{
    const c=customerById(o.customerId,customers);
    return (filter==="all"||o.status===filter)&&(`${o.orderNo} ${o.items} ${c?.name||""}`.toLowerCase().includes(q));
  });
  $("orders-list").innerHTML=list.length?list.map(o=>{const c=customerById(o.customerId,customers);return `<article class="record"><div class="record-main"><div class="record-title">${esc(o.orderNo)} · ${esc(c?.name||"Customer missing")}</div><div class="record-sub">${esc(o.items)}<br>${dateText(o.date)} ${o.total? " · "+money(o.total):""}</div><span class="status ${statusClass(o.status)}">${esc(o.status)}</span></div><div class="record-actions"><button class="small-button" data-edit-order="${esc(o.id)}">Edit</button><button class="small-button whatsapp" data-message-order="${esc(o.id)}">WhatsApp</button><button class="small-button" data-delete-order="${esc(o.id)}">Delete</button></div></article>`}).join(""):`<div class="empty-state">No matching orders. Create an order to get started.</div>`;
}
async function renderCustomers(){
  const [customers,orders]=await Promise.all([all("customers"),all("orders")]);
  const q=$("customer-search").value.toLowerCase();
  const list=customers.sort((a,b)=>a.name.localeCompare(b.name)).filter(c=>`${c.name} ${c.phone} ${c.email||""}`.toLowerCase().includes(q));
  $("customers-list").innerHTML=list.length?list.map(c=>{const count=orders.filter(o=>o.customerId===c.id).length;return `<article class="record"><div class="record-main"><div class="record-title">${esc(c.name)}</div><div class="record-sub">${esc(c.phone)} · ${count} order${count===1?"":"s"}${c.notes?" · "+esc(c.notes):""}</div></div><div class="record-actions"><button class="small-button whatsapp" data-customer-message="${esc(c.id)}">WhatsApp</button><button class="small-button" data-edit-customer="${esc(c.id)}">Edit</button><button class="small-button" data-delete-customer="${esc(c.id)}">Delete</button></div></article>`}).join(""):`<div class="empty-state">No customers yet. Add one or import contacts from your phone.</div>`;
}
async function refreshCustomerSelects(){
  const customers=await all("customers");
  const products=await all("products");
  if($("order-product-select"))$("order-product-select").innerHTML='<option value="">Choose product…</option>'+products.filter(p=>p.active!==false).map(p=>`<option value="${esc(p.id)}">${esc(p.name)} · ${formatRand(p.price)}</option>`).join("");
  const options=customers.sort((a,b)=>a.name.localeCompare(b.name)).map(c=>`<option value="${esc(c.id)}">${esc(c.name)} · ${esc(c.phone)}</option>`).join("");
  $("order-customer").innerHTML='<option value="">Choose customer…</option>'+options;
  $("message-customer").innerHTML='<option value="">Choose a customer…</option>'+options;
}
async function renderMessages(){
  const [templates,orders]=await Promise.all([all("templates"),all("orders")]);
  $("message-template").innerHTML=templates.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("");
  $("templates-list").innerHTML=templates.map(t=>`<div class="template-item"><div><strong>${esc(t.name)}</strong><p>${esc(t.text.slice(0,90))}${t.text.length>90?"…":""}</p></div><button class="small-button" data-edit-template="${esc(t.id)}">Edit</button></div>`).join("");
  refreshOrderSelect();
  if(!$("message-body").value)loadSelectedTemplate();
}
async function refreshOrderSelect(){
  const customerId=$("message-customer").value;
  const orders=await all("orders");
  const filtered=orders.filter(o=>!customerId||o.customerId===customerId).sort((a,b)=>(b.updatedAt||"").localeCompare(a.updatedAt||""));
  $("message-order").innerHTML='<option value="">No order selected</option>'+filtered.map(o=>`<option value="${esc(o.id)}">${esc(o.orderNo)} · ${esc(o.status)} · ${esc(o.items)}</option>`).join("");
}
async function loadSelectedTemplate(){
  const templates=await all("templates"),t=templates.find(x=>x.id===$("message-template").value);
  if(t)$("message-body").value=t.text;
}
async function populateMessageFromOrder(orderId){
  const [orders,customers]=await Promise.all([all("orders"),all("customers")]);
  const o=orders.find(x=>x.id===orderId);if(!o)return;
  $("message-customer").value=o.customerId;await refreshOrderSelect();$("message-order").value=o.id;
  showView("messages");
}
async function templateVars(){
  const [customers,orders,settings]=await Promise.all([all("customers"),all("orders"),all("settings")]);
  const c=customerById($("message-customer").value,customers);
  const o=orders.find(x=>x.id===$("message-order").value);
  const bakery=settings.find(s=>s.id==="bakery")?.name||"Ugly Baker Bread Co";
  return {name:c?.name||"there",order:o?.orderNo||"your order",items:o?.items||"your order",status:o?.status||"",bakery};
}
async function sendWhatsApp(){
  const [customers]=await Promise.all([all("customers")]);
  const c=customerById($("message-customer").value,customers);
  if(!c){toast("Choose a customer first.");return;}
  const phone=normalisePhone(c.phone);
  if(!phone){toast("This customer has no valid phone number.");return;}
  const vars=await templateVars();
  const message=$("message-body").value.replace(/\{(name|order|items|status|bakery)\}/g,(_,k)=>vars[k]||"");
  if(!message.trim()){toast("Write a message first.");return;}
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`,"_blank","noopener");
}


function formatRand(value){return "R"+Number(value||0).toFixed(2);}
async function productCost(product){
  const [ingredients,recipes]=await Promise.all([all("ingredients"),all("recipes")]);
  const recipe=recipes.find(r=>r.productId===product.id);
  if(!recipe||!recipe.lines?.length)return null;
  let ingredientTotal=0,complete=true;
  for(const line of recipe.lines){
    const ing=ingredients.find(i=>i.id===line.ingredientId);
    if(!ing||!Number.isFinite(Number(ing.cost))||!Number.isFinite(Number(line.quantity))){complete=false;continue;}
    ingredientTotal+=Number(ing.cost)*Number(line.quantity);
  }
  if(!complete)return {complete:false};
  const packaging=Number(product.packagingCost||0);
  const total=ingredientTotal+packaging;
  const price=Number(product.price||0);
  return {complete:true,ingredientTotal,packaging,total,price,profit:price-total,margin:price>0?(price-total)/price*100:null};
}
async function renderProducts(){
  const products=await all("products");
  const q=$("product-search").value.toLowerCase(),filter=$("product-filter").value;
  const filtered=products.sort((a,b)=>a.name.localeCompare(b.name)).filter(p=>(filter==="all"||(filter==="active"?p.active!==false:p.active===false))&&p.name.toLowerCase().includes(q));
  const cards=[];
  for(const p of filtered){
    const cost=await productCost(p);
    let costText=cost===null?"Costing not configured":!cost.complete?"Recipe needs attention":`Estimated cost ${formatRand(cost.total)} · Gross profit ${formatRand(cost.profit)}${cost.margin===null?"":" ("+cost.margin.toFixed(1)+"%)"}`;
    cards.push(`<article class="record"><div class="record-main"><div class="record-title">${esc(p.name)} <span class="status ${p.active===false?"cancelled":"ready"}">${p.active===false?"Discontinued":"Active"}</span></div><div class="record-sub">${esc(p.description||"No description")}<br>Selling price: <strong>${formatRand(p.price)}</strong></div><div class="product-cost">${esc(costText)}</div></div><div class="record-actions"><button class="small-button" data-edit-product="${esc(p.id)}">Edit</button><button class="small-button" data-recipe-product="${esc(p.id)}">Recipe / costing</button><button class="small-button" data-delete-product="${esc(p.id)}">Delete</button></div></article>`);
  }
  $("products-list").innerHTML=cards.length?cards.join(""):`<div class="empty-state">No products yet. Add your first bakery product. Costing is optional.</div>`;
}
async function renderIngredients(){
  const ingredients=await all("ingredients");
  ingredients.sort((a,b)=>a.name.localeCompare(b.name));
  $("ingredients-list").innerHTML=ingredients.length?ingredients.map(i=>`<article class="record"><div class="record-main"><div class="record-title">${esc(i.name)}</div><div class="record-sub">${formatRand(i.cost)} per ${esc(i.unit)}${i.notes?" · "+esc(i.notes):""}</div></div><div class="record-actions"><button class="small-button" data-edit-ingredient="${esc(i.id)}">Adjust cost</button><button class="small-button" data-delete-ingredient="${esc(i.id)}">Delete</button></div></article>`).join(""):`<div class="empty-state">No ingredient costs entered. That's fine — products and orders can still be managed without them.</div>`;
}
async function openRecipe(productId){
  const [products,ingredients,recipes]=await Promise.all([all("products"),all("ingredients"),all("recipes")]);
  const p=products.find(x=>x.id===productId);if(!p)return;
  $("recipe-product-id").value=p.id;$("recipe-product-label").textContent=`${p.name} · Selling price ${formatRand(p.price)} · Packaging ${formatRand(p.packagingCost||0)}`;
  const recipe=recipes.find(r=>r.productId===p.id);
  $("recipe-lines").innerHTML="";
  if(recipe?.lines?.length){for(const line of recipe.lines)addRecipeLine(line.ingredientId,line.quantity);}
  else if(ingredients.length)addRecipeLine();
  else $("recipe-lines").innerHTML='<p class="muted">Add ingredients in Ingredients & costs first, then return here to build a recipe.</p>';
  await updateRecipePreview();
  $("recipe-dialog").showModal();
}
async function addRecipeLine(selectedId="",quantity=""){
  const ingredients=await all("ingredients");
  if(!ingredients.length){toast("Add an ingredient and its input cost first.");return;}
  const row=document.createElement("div");row.className="recipe-row";
  row.innerHTML=`<label>Ingredient<select class="recipe-ingredient">${ingredients.map(i=>`<option value="${esc(i.id)}" ${i.id===selectedId?"selected":""}>${esc(i.name)} (${esc(i.unit)})</option>`).join("")}</select></label><label>Quantity<input class="recipe-quantity" type="number" min="0" step="0.0001" value="${quantity!==""?esc(quantity):""}" placeholder="0"></label><button type="button" class="remove-line" aria-label="Remove ingredient">×</button>`;
  row.querySelectorAll("select,input").forEach(el=>el.addEventListener("input",updateRecipePreview));
  row.querySelector(".remove-line").onclick=()=>{row.remove();updateRecipePreview();};
  $("recipe-lines").appendChild(row);
}
async function updateRecipePreview(){
  const product=(await all("products")).find(p=>p.id===$("recipe-product-id").value);
  const ingredients=await all("ingredients");
  let sum=0,missing=false,lines=0;
  document.querySelectorAll(".recipe-row").forEach(row=>{
    const ing=ingredients.find(i=>i.id===row.querySelector(".recipe-ingredient").value);
    const qty=Number(row.querySelector(".recipe-quantity").value);
    if(ing&&qty>0){sum+=Number(ing.cost)*qty;lines++;}else if(row.querySelector(".recipe-quantity").value)missing=true;
  });
  const packaging=Number(product?.packagingCost||0),total=sum+packaging,price=Number(product?.price||0);
  $("recipe-cost-preview").innerHTML=`Ingredient cost: <b>${formatRand(sum)}</b><br>Packaging: <b>${formatRand(packaging)}</b><br>Estimated total cost: <strong>${formatRand(total)}</strong><br>${price?`Estimated gross profit: <b>${formatRand(price-total)}</b> (${((price-total)/price*100).toFixed(1)}% margin)`:"Add a selling price to calculate gross profit."}${missing?"<br><span class='warning-text'>Check incomplete quantities.</span>":""}`;
}
async function editProduct(id){
  const p=(await all("products")).find(x=>x.id===id);if(!p)return;
  $("product-id").value=p.id;$("product-name").value=p.name;$("product-price").value=p.price??"";$("product-packaging").value=p.packagingCost??"";$("product-description").value=p.description||"";$("product-active").value=p.active===false?"false":"true";
  $("product-dialog-title").textContent="Edit product";openDialog("product-dialog");
}
async function editIngredient(id){
  const i=(await all("ingredients")).find(x=>x.id===id);if(!i)return;
  $("ingredient-id").value=i.id;$("ingredient-name").value=i.name;$("ingredient-cost").value=i.cost;$("ingredient-unit").value=i.unit;$("ingredient-notes").value=i.notes||"";
  $("ingredient-dialog-title").textContent="Adjust input cost";openDialog("ingredient-dialog");
}
async function addProductToOrder(){
  const id=$("order-product-select").value,qty=Math.max(1,Number($("order-product-qty").value)||1);
  if(!id){toast("Choose a product first.");return;}
  const p=(await all("products")).find(x=>x.id===id);if(!p)return;
  const line=`${qty} × ${p.name} @ ${formatRand(p.price)}`;
  const current=$("order-items").value.trim();
  $("order-items").value=current?current+"\n"+line:line;
  const total=Number($("order-total").value||0)+Number(p.price||0)*qty;
  $("order-total").value=total.toFixed(2);
}

function resetCustomerForm(){ $("customer-form").reset();$("customer-id").value="";$("customer-dialog-title").textContent="Add customer"; }
async function editCustomer(id){
  const c=(await all("customers")).find(x=>x.id===id);if(!c)return;
  $("customer-id").value=c.id;$("customer-name").value=c.name;$("customer-phone").value=c.phone;$("customer-email").value=c.email||"";$("customer-notes").value=c.notes||"";
  $("customer-dialog-title").textContent="Edit customer";openDialog("customer-dialog");
}
function resetOrderForm(){ $("order-form").reset();$("order-id").value="";$("order-dialog-title").textContent="New order";$("order-date").value=new Date().toISOString().slice(0,10);$("order-status").value="Received"; }
async function editOrder(id){
  const o=(await all("orders")).find(x=>x.id===id);if(!o)return;
  await refreshCustomerSelects();$("order-id").value=o.id;$("order-customer").value=o.customerId;$("order-items").value=o.items;$("order-date").value=o.date||"";$("order-total").value=o.total||"";$("order-status").value=o.status;$("order-notes").value=o.notes||"";
  $("order-dialog-title").textContent="Edit order";openDialog("order-dialog");
}
function csvCell(v){return '"'+String(v??"").replace(/"/g,'""')+'"';}
function download(filename,content,type="application/json"){
  const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
}
function stamp(){return new Date().toISOString().slice(0,10);}
async function exportBackup(){
  const data={app:"Ugly Baker Bread Co PWA",version:1,exportedAt:new Date().toISOString()};
  for(const name of STORE_NAMES)data[name]=await all(name);
  download(`ugly-baker-backup-${stamp()}.json`,JSON.stringify(data,null,2));
  toast("Backup downloaded. Keep it somewhere safe.");
}
async function exportCSV(type){
  const rows=await all(type),customers=type==="orders"?await all("customers"):[];
  let headers,values;
  if(type==="customers"){headers=["Name","Phone","Email","Notes"];values=rows.map(x=>[x.name,x.phone,x.email,x.notes]);}
  else{headers=["Order","Customer","Items","Date","Total ZAR","Status","Notes"];values=rows.map(x=>[x.orderNo,customerById(x.customerId,customers)?.name,x.items,x.date,x.total,x.status,x.notes]);}
  const csv=[headers,...values].map(row=>row.map(csvCell).join(",")).join("\r\n");
  download(`ugly-baker-${type}-${stamp()}.csv`,"\ufeff"+csv,"text/csv;charset=utf-8");
}
async function validateBackup(data){
  if(!data||data.app!=="Ugly Baker Bread Co PWA"||!Array.isArray(data.customers)||!Array.isArray(data.orders)||!Array.isArray(data.templates))throw new Error("This does not look like a valid Ugly Baker backup.");
  for(const key of ["customers","orders","templates"])for(const item of data[key])if(!item.id)throw new Error("Backup contains a record without an ID.");
  return data;
}
async function importBackup(data,mode){
  if(mode==="replace")for(const n of STORE_NAMES)await clear(n);
  for(const n of STORE_NAMES)for(const item of (data[n]||[]))await put(n,item);
  await renderAll();toast(mode==="replace"?"Backup restored.":"Backup merged successfully.");
}
async function readBackup(file){
  try{
    const data=await validateBackup(JSON.parse(await file.text()));
    pendingBackup=data;
    $("restore-summary").textContent=`Backup from ${data.exportedAt?new Date(data.exportedAt).toLocaleString():"an unknown date"} · ${(data.customers||[]).length} customers · ${(data.orders||[]).length} orders · ${(data.templates||[]).length} templates.`;
    openDialog("restore-dialog");
  }catch(e){toast(e.message||"Could not read backup.");}
}
function parseVcf(text){
  const unfolded=text.replace(/\r?\n[ \t]/g,"");
  const cards=unfolded.split(/BEGIN:VCARD/i).slice(1);
  const contacts=[];
  for(const card of cards){
    const body=card.split(/END:VCARD/i)[0];
    const get=(key)=>{const line=body.split(/\r?\n/).find(x=>new RegExp("^"+key+"(?:;[^:]*)?:","i").test(x));return line?line.slice(line.indexOf(":")+1).replace(/\\[nN]/g," ").replace(/\\,/g,",").trim():"";};
    let name=get("FN");
    if(!name){const n=get("N").split(";").filter(Boolean).reverse().join(" ");name=n;}
    const phones=[...body.matchAll(/^TEL[^:]*:(.+)$/gim)].map(m=>m[1].trim());
    const phone=phones.find(p=>normalisePhone(p).length>=9);
    if(name&&phone)contacts.push({name,phone,email:get("EMAIL")});
  }
  return contacts;
}
async function importContacts(contacts){
  const existing=await all("customers");let added=0,skipped=0;
  for(const c of contacts){
    const normalized=normalisePhone(c.phone);
    const match=existing.find(x=>normalisePhone(x.phone)===normalized);
    if(match){skipped++;continue;}
    const record={id:uid("cus-"),name:c.name,phone:c.phone,email:c.email||"",notes:"",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    await put("customers",record);existing.push(record);added++;
  }
  await renderAll();toast(`${added} contact${added===1?"":"s"} imported; ${skipped} existing number${skipped===1?"":"s"} skipped.`);
}
async function renderAll(){await renderDashboard();await renderOrders();await renderCustomers();await renderProducts();await renderIngredients();await renderMessages();}

async function init(){
  db=await openDB();
  if(!(await all("templates")).length)for(const t of DEFAULT_TEMPLATES)await put("templates",t);
  if(!(await all("settings")).length)await put("settings",{id:"bakery",name:"Ugly Baker Bread Co"});
  await refreshCustomerSelects();await renderAll();
  document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.view)));
  document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.go)));
  document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>closeDialog(b.dataset.close)));
  $("add-customer").onclick=()=>{resetCustomerForm();openDialog("customer-dialog");};
  $("add-order").onclick=$("quick-add-order").onclick=async()=>{resetOrderForm();await refreshCustomerSelects();if(!(await all("customers")).length){toast("Add or import a customer first.");showView("customers");return;}openDialog("order-dialog");};
  $("customer-form").onsubmit=async e=>{e.preventDefault();const id=$("customer-id").value||uid("cus-");const old=(await all("customers")).find(c=>c.id===id);await put("customers",{id,name:$("customer-name").value.trim(),phone:$("customer-phone").value.trim(),email:$("customer-email").value.trim(),notes:$("customer-notes").value.trim(),createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()});closeDialog("customer-dialog");await refreshCustomerSelects();await renderAll();toast("Customer saved.");};
  $("order-form").onsubmit=async e=>{e.preventDefault();const id=$("order-id").value||uid("ord-");const old=(await all("orders")).find(o=>o.id===id);const allOrders=await all("orders");const orderNo=old?.orderNo||"UB"+String(Math.max(0,...allOrders.map(o=>parseInt(String(o.orderNo||"").replace(/\D/g,""))||0))+1).padStart(3,"0");await put("orders",{id,orderNo,customerId:$("order-customer").value,items:$("order-items").value.trim(),date:$("order-date").value,total:$("order-total").value, status:$("order-status").value,notes:$("order-notes").value.trim(),createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()});closeDialog("order-dialog");await renderAll();toast("Order saved.");};
  $("customer-search").oninput=renderCustomers;$("order-search").oninput=renderOrders;$("order-filter").onchange=renderOrders;
  $("customers-list").addEventListener("click",async e=>{const b=e.target.closest("button");if(!b)return;if(b.dataset.editCustomer)editCustomer(b.dataset.editCustomer);if(b.dataset.deleteCustomer){if(confirm("Delete this customer? Existing orders will remain but lose their customer link.")){await remove("customers",b.dataset.deleteCustomer);await renderAll();}}if(b.dataset.customerMessage){const c=(await all("customers")).find(x=>x.id===b.dataset.customerMessage);showView("messages");$("message-customer").value=c.id;await refreshOrderSelect();$("message-body").value="";}});
  $("orders-list").addEventListener("click",async e=>{const b=e.target.closest("button");if(!b)return;if(b.dataset.editOrder)editOrder(b.dataset.editOrder);if(b.dataset.messageOrder)populateMessageFromOrder(b.dataset.messageOrder);if(b.dataset.deleteOrder&&confirm("Delete this order?")){await remove("orders",b.dataset.deleteOrder);await renderAll();}});
  $("message-customer").onchange=refreshOrderSelect;$("message-template").onchange=loadSelectedTemplate;$("send-whatsapp").onclick=sendWhatsApp;
  $("add-template").onclick=()=>{ $("template-form").reset();$("template-id").value="";$("template-dialog-title").textContent="Add template";openDialog("template-dialog");};
  $("templates-list").addEventListener("click",async e=>{const b=e.target.closest("[data-edit-template]");if(!b)return;const t=(await all("templates")).find(x=>x.id===b.dataset.editTemplate);$("template-id").value=t.id;$("template-name").value=t.name;$("template-text").value=t.text;$("template-dialog-title").textContent="Edit template";openDialog("template-dialog");});
  $("template-form").onsubmit=async e=>{e.preventDefault();const id=$("template-id").value||uid("tpl-");await put("templates",{id,name:$("template-name").value.trim(),text:$("template-text").value});closeDialog("template-dialog");await renderMessages();toast("Template saved.");};
  $("import-contacts").onclick=async()=>{if(!("contacts" in navigator&&"ContactsManager" in window)){toast("Contact picker isn't supported here. Use Import .vcf instead.");return;}try{const c=await navigator.contacts.select(["name","tel","email"],{multiple:true});const mapped=c.map(x=>({name:x.name?.[0]||"",phone:x.tel?.[0]||"",email:x.email?.[0]||""})).filter(x=>x.name&&x.phone);await importContacts(mapped);}catch(e){if(e.name!=="AbortError")toast("Contact import was unavailable. Try a .vcf file.");}};
  $("import-vcf").onclick=()=>$("vcf-file").click();
  $("vcf-file").onchange=async e=>{const f=e.target.files[0];if(f){const contacts=parseVcf(await f.text());if(contacts.length)await importContacts(contacts);else toast("No contacts with both a name and phone number were found.");e.target.value="";}};
  $("export-backup").onclick=$("backup-top").onclick=exportBackup;
  $("choose-backup").onclick=()=>$("backup-file").click();
  $("backup-file").onchange=e=>{const f=e.target.files[0];if(f)readBackup(f);e.target.value="";};
  $("restore-form").onsubmit=async e=>{e.preventDefault();if(!pendingBackup)return;const mode=new FormData(e.target).get("restore-mode");if(mode==="replace"&&!confirm("This will replace all current local data. Continue?"))return;await importBackup(pendingBackup,mode);pendingBackup=null;closeDialog("restore-dialog");};

  $("add-product").onclick=()=>{$("product-form").reset();$("product-id").value="";$("product-dialog-title").textContent="Add product";openDialog("product-dialog");};
  $("product-form").onsubmit=async e=>{e.preventDefault();const id=$("product-id").value||uid("prd-");const old=(await all("products")).find(p=>p.id===id);await put("products",{id,name:$("product-name").value.trim(),price:Number($("product-price").value||0),packagingCost:Number($("product-packaging").value||0),description:$("product-description").value.trim(),active:$("product-active").value==="true",createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()});closeDialog("product-dialog");await renderAll();toast("Product saved.");};
  $("products-list").addEventListener("click",async e=>{const b=e.target.closest("button");if(!b)return;if(b.dataset.editProduct)editProduct(b.dataset.editProduct);if(b.dataset.recipeProduct)openRecipe(b.dataset.recipeProduct);if(b.dataset.deleteProduct&&confirm("Delete this product? Existing orders will remain unchanged.")){await remove("products",b.dataset.deleteProduct);const recipes=await all("recipes");for(const r of recipes.filter(x=>x.productId===b.dataset.deleteProduct))await remove("recipes",r.id);await renderAll();}});
  $("product-search").oninput=renderProducts;$("product-filter").onchange=renderProducts;
  $("add-ingredient").onclick=()=>{$("ingredient-form").reset();$("ingredient-id").value="";$("ingredient-dialog-title").textContent="Add ingredient";openDialog("ingredient-dialog");};
  $("ingredient-form").onsubmit=async e=>{e.preventDefault();const id=$("ingredient-id").value||uid("ing-");const old=(await all("ingredients")).find(i=>i.id===id);await put("ingredients",{id,name:$("ingredient-name").value.trim(),cost:Number($("ingredient-cost").value),unit:$("ingredient-unit").value.trim(),notes:$("ingredient-notes").value.trim(),createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()});closeDialog("ingredient-dialog");await renderAll();toast("Input cost saved. Current product estimates updated.");};
  $("ingredients-list").addEventListener("click",async e=>{const b=e.target.closest("button");if(!b)return;if(b.dataset.editIngredient)editIngredient(b.dataset.editIngredient);if(b.dataset.deleteIngredient&&confirm("Delete this ingredient? Recipes using it will need attention.")){await remove("ingredients",b.dataset.deleteIngredient);await renderAll();}});
  $("add-recipe-line").onclick=()=>addRecipeLine();
  $("recipe-form").onsubmit=async e=>{e.preventDefault();const productId=$("recipe-product-id").value;const lines=[...document.querySelectorAll(".recipe-row")].map(row=>({ingredientId:row.querySelector(".recipe-ingredient").value,quantity:Number(row.querySelector(".recipe-quantity").value)})).filter(x=>x.ingredientId&&x.quantity>0);const old=(await all("recipes")).find(r=>r.productId===productId);if(old)await remove("recipes",old.id);if(lines.length)await put("recipes",{id:old?.id||uid("rec-"),productId,lines,updatedAt:new Date().toISOString()});closeDialog("recipe-dialog");await renderAll();toast("Recipe costing saved.");};
  $("add-product-to-order").onclick=addProductToOrder;

  $("export-customers").onclick=()=>exportCSV("customers");$("export-orders").onclick=()=>exportCSV("orders");
  if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});
}
init().catch(e=>{console.error(e);toast("The app could not start. Try reloading this page.");});