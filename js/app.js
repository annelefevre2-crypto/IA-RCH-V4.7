// ======================================================
// Mémento opérationnel IA – RCH (ENSOSP) — app.js v4.7.0
// (see previous assistant message for detailed comments)
(() => {
  const videoEl = document.getElementById("camera");
  const cameraBtn = document.getElementById("cameraBtn");
  const scanBtn = document.getElementById("scanBtn");
  const resetBtn = document.getElementById("resetBtn");
  const qrFile = document.getElementById("qrFile");

  const videoBox = document.getElementById("videoBox");
  const scanHint = document.getElementById("scanHint");
  const scanOverlay = document.getElementById("scanOverlay");

  const cameraError = document.getElementById("cameraError");
  const successMsg = document.getElementById("successMsg");

  const ficheMeta = document.getElementById("ficheMeta");
  const infosComplementaires = document.getElementById("infosComplementaires");
  const compiledPrompt = document.getElementById("compiledPrompt");
  const iaButtons = document.getElementById("iaButtons");

  const formFields = document.getElementById("formFields");
  const btnGenerate = document.getElementById("btnGenerate");

  const APP_VERSION = "v4.7.0";
  let state = { qr: null };
  let lastImportedObjectURL = null;

  const showEl = (el) => el && el.classList.remove("hidden");
  const hideEl = (el) => el && el.classList.add("hidden");
  const showScanUI = () => { showEl(videoBox); showEl(scanHint); showEl(scanOverlay); };
  const hideScanUI = () => { hideEl(scanHint); hideEl(scanOverlay); hideEl(videoBox); };
  const showError = (msg) => { if(!cameraError) return alert(msg); cameraError.textContent = msg; showEl(cameraError); };
  const hideError = () => hideEl(cameraError);
  const showSuccess = (t) => { if(!successMsg) return; if(t) successMsg.textContent=t; showEl(successMsg); setTimeout(()=>hideEl(successMsg),1500); };

 // ---------- QrScanner instance ----------
  async function startScanner(backId) {
    const QrScanner = window.__QrScanner;
    if (!QrScanner) {
      showError("QrScanner non chargé (vérifie le bloc <script type='module'> dans index.html).");
      return;
    }

    if (window.__scanner) {
      await window.__scanner.stop();
      window.__scanner.destroy();
      window.__scanner = null;
    }

    const scanner = new QrScanner(
      videoEl,
      (result) => {
        const data = result?.data || result;
        if (!data) return;
        hideScanUI();
        stopCamera().finally(() => {
          handleQRContent(data);
          showSuccess("✅ QR Code détecté avec succès");
        });
      },
      { highlightScanRegion: true, highlightCodeOutline: true }
    );

    if (backId) await scanner.start(backId);
    else await scanner.start();

    window.__scanner = scanner;
    console.log("📷 QrScanner démarré");
  }

  function startCamera(){
    hideError();
    navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false})
      .then(async (pre)=>{
        pre.getTracks().forEach(t=>t.stop());
        const QrScanner = window.__QrScanner; let backId=null;
        try{ const cams = await QrScanner.listCameras(true);
          if(Array.isArray(cams)&&cams.length){ const back=cams.find(c=>/back|rear|environment/i.test(c.label))||cams[0]; backId=back.id; }
        }catch(_){}
        await startScanner(backId); showScanUI();
      }).catch(e=>{ showError("Impossible d'accéder à la caméra : "+(e?.message||e)); });
  }
  async function stopCamera(){ try{ if(window.__scanner){ await window.__scanner.stop(); window.__scanner.destroy(); window.__scanner=null; } }finally{ hideScanUI(); } }
  function detectQRCode(){ if(!window.__scanner) startCamera(); }

  qrFile?.addEventListener("change", async (e)=>{
    const file = e.target.files?.[0]; if(!file) return;
    try{
      const QrScanner = window.__QrScanner; if(!QrScanner) return showError("QrScanner non chargé.");
      if(lastImportedObjectURL) URL.revokeObjectURL(lastImportedObjectURL);
      lastImportedObjectURL = URL.createObjectURL(file);
      const res = await QrScanner.scanImage(file,{returnDetailedScanResult:true});
      const data = res?.data || res; if(!data) return showError("Aucun QR lisible.");
      hideScanUI(); handleQRContent(data); showSuccess("✅ QR Code détecté avec succès");
    }catch{ showError("Aucun QR lisible."); }
  });

 // --- utilitaires ---
const slugify = (s)=> (s||"")
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");

const normalizeId = (x)=>{
  const s = slugify(x);
  const map = {
    code_onu:"code_onu", onu:"code_onu", un:"code_onu",
    code_danger_adr:"code_danger_adr", code_danger:"code_danger_adr", kemler:"code_danger_adr",
    nom_produit:"nom_produit", nom_du_produit:"nom_produit", name:"nom_produit", nom:"nom_produit",
    numero_cas:"numero_cas", num_cas:"numero_cas", n_cas:"numero_cas", ncas:"numero_cas"
  };
  return map[s] || s;
};

const firstKey = (obj, keys=[]) => {
  for (const k of keys) if (k in (obj||{})) return obj[k];
  return "";
};

// --- NOUVELLE extractFields ---
function extractFields(obj) {
  // 1) Format JSON “propre”
  if (Array.isArray(obj?.fields)) {
    return obj.fields.map(x => ({
      id: normalizeId(x.id || x.name || x.label),
      label: x.label || x.titre || x.name || x.id,
      type: (x.type || "text").toLowerCase(),
      required: !!x.required,
      options: x.options || []
    }));
  }

  // 2) Fallback “tableau OPS” (labels / types / obligatoire in CSV)
  const labelsCSV = firstKey(obj, [
    "nom_champ_entrée","nom_champ_entree","nom_champ","nom_champs",
    "Champs / données d'entrée","Champs / donnees d'entree","champs_d_entree"
  ]);
  const typesCSV  = firstKey(obj, [
    "type_champ","type_de_champs","type champs","type",
    "type de champs","types"
  ]);
  const reqCSV    = firstKey(obj, [
    "Obligatoire","obligatoire","Obligatoire (O/F)","O/F"
  ]);

  const labels = String(labelsCSV).split(",").map(s=>s.trim()).filter(Boolean);
  const types  = String(typesCSV).split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
  const reqs   = String(reqCSV).split(",").map(s=>s.trim().toUpperCase()).filter(Boolean);

  return labels.map((label, i) => ({
    id: normalizeId(label),
    label,
    type: (types[i] || "text"),
    required: (reqs[i] || "F") === "O",
    options: []
  }));
}

  function ensureExtraInfoField(){
    let el = document.getElementById("extraInfo");
    if(el && el.parentElement) return;
    const wrap = document.createElement("div"); wrap.className="field";
    const lab = document.createElement("label"); lab.setAttribute("for","extraInfo"); lab.textContent="Informations complémentaires"; wrap.appendChild(lab);
    el = document.createElement("textarea"); el.id="extraInfo"; el.rows=4; el.placeholder="Notes libres, observations, mots-clés…"; el.className="input-xl"; wrap.appendChild(el);
    formFields.appendChild(wrap);
    el.addEventListener("input", generatePromptFromForm);
  }

  function renderFields(fields){
    formFields.innerHTML="";
    if(!fields.length){ ensureExtraInfoField(); return; }
    fields.forEach(f=>{
      const wrap = document.createElement("div"); wrap.className="field";
      const lab = document.createElement("label"); lab.htmlFor=`fld_${f.id}`; lab.textContent=f.label||f.id; wrap.appendChild(lab);
      if(f.type==="gps"){
        const box=document.createElement("div"); box.className="gps-field";
        const t=document.createElement("input"); t.type="text"; t.placeholder="lat, lon ±précision (m)"; t.className="input-xl"; t.dataset.fieldId=f.id; t.id=`fld_${f.id}`;
        const b=document.createElement("button"); b.type="button"; b.className="gps-btn"; b.textContent="Acquérir position"; b.addEventListener("click",()=>acquireGPSInto(t));
        box.appendChild(t); box.appendChild(b); wrap.appendChild(box); formFields.appendChild(wrap); return;
      }
      let input;
      if(f.type==="textarea"){ input=document.createElement("textarea"); input.rows=3; }
      else if(f.type==="number"){ input=document.createElement("input"); input.type="number"; }
      else if(f.type==="select"){ input=document.createElement("select"); (f.options||[]).forEach(opt=>{ const o=document.createElement("option"); o.value=opt; o.textContent=opt; input.appendChild(o); }); }
      else { input=document.createElement("input"); input.type="text"; }
      input.id=`fld_${f.id}`; input.dataset.fieldId=f.id; input.classList.add("input-xl"); if(f.required) input.required=true;
      wrap.appendChild(input); formFields.appendChild(wrap);
    });
    ensureExtraInfoField();
    formFields.querySelectorAll("[data-field-id]").forEach(el=>{ el.addEventListener("input", generatePromptFromForm); });
  }

  function acquireGPSInto(targetInput){
    if(!navigator.geolocation) return alert("Géolocalisation non supportée.");
    targetInput.disabled=true; targetInput.placeholder="Acquisition en cours…";
    navigator.geolocation.getCurrentPosition((pos)=>{
      const {latitude,longitude,accuracy}=pos.coords;
      targetInput.value=`${latitude.toFixed(6)}, ${longitude.toFixed(6)} ±${Math.round(accuracy)}m`;
      targetInput.disabled=false; targetInput.placeholder="lat, lon ±précision (m)"; generatePromptFromForm();
    },(err)=>{ alert("GPS refusé : "+err.message); targetInput.disabled=false; targetInput.placeholder="lat, lon ±précision (m)"; },
    {enableHighAccuracy:true,timeout:10000,maximumAge:0});
  }

  function collectFieldValues(withLabels=false){
    const vals={};
    formFields.querySelectorAll("[data-field-id]").forEach(el=>{
      const id=el.dataset.fieldId;
      const label=(el.closest(".field")?.querySelector("label")?.textContent||id).trim();
      const v=(el.type==="checkbox")?(el.checked?"oui":"non"):(el.value||"").trim();
      vals[id]=withLabels?{value:v,label}:v;
    });
    return vals;
  }

  function generatePromptFromForm(){
    if(!state.qr) return;
    let tpl=(state.qr.prompt||state.qr["prompt JSON"]||state.qr.promptTemplate||"").trim();
    if(!tpl){ compiledPrompt.value=""; return; }

    const vals=collectFieldValues(false);
    const valsWithLabels=collectFieldValues(true);
    const used=new Set();
    tpl=tpl.replace(/{{\s*([^}]+)\s*}}/g,(_,kRaw)=>{ const k=normalizeId(kRaw.trim()); used.add(k); return (vals[k]??""); });

    const extras=[];
    Object.entries(valsWithLabels).forEach(([k,obj])=>{ if(!obj.value) return; if(!used.has(k)) extras.push(`${obj.label} : ${obj.value}`); });
    const extraFreeEl=document.getElementById("extraInfo"); const extraFree=(extraFreeEl?.value||"").trim();
    if(extraFree) extras.push(`Informations complémentaires : ${extraFree}`);
    if(extras.length) tpl += "\n\n# Données complémentaires\n" + extras.join("\n");
    compiledPrompt.value = tpl;
  }

  function handleQRContent(raw){
    let jsonStr=(raw||"").trim();
    try{
      if(jsonStr.startsWith("data:application/json")) jsonStr = atob(jsonStr.split(",")[1]);
      const obj=JSON.parse(jsonStr);
      state.qr=obj; updateInterface();
    }catch(err){ console.error("QR/JSON invalide:",err); showError("QR invalide ou JSON mal formé."); }
  }

  function updateInterface(){
    if(!state.qr) return;
    ficheMeta.textContent = `${state.qr.categorie||"–"} – ${state.qr.nom_fiche||state.qr.titre||"–"} – ${state.qr.version||state.qr["version text"]||"–"}`;
    const refs = Array.isArray(state.qr.references_bibliographiques) ? state.qr.references_bibliographiques.join(", ") : (state.qr["sources text F"]||state.qr["sources"]||"");
    const objectif = state.qr.objectif ? `<strong>Objectif :</strong> ${state.qr.objectif}<br>` : "";
    const refsTxt = refs ? `<strong>Références :</strong> ${refs}` : "";
    infosComplementaires.innerHTML = `${objectif}${refsTxt}`.trim();
    compiledPrompt.value=(state.qr.prompt||state.qr["prompt JSON"]||state.qr.promptTemplate||"").trim();
    const flds=extractFields(state.qr); renderFields(flds); generatePromptFromForm();
    renderIABtns();
  }

  const DEFAULT_IA_URLS={chatgpt:"https://chatgpt.com/?q=%q%",claude:"https://claude.ai/new?prompt=%q%",gemini:"https://gemini.google.com/?q=%q%",perplexity:"https://www.perplexity.ai/?q=%q%",deepseek:"https://chat.deepseek.com/?q=%q%","le chat":"https://chat.mistral.ai/chat?q=%q%",grok:"https://grok.com/?q=%q%"};

  function renderIABtns(){
    iaButtons.innerHTML="";
    let table=state.qr?.ia_cotation||state.qr?.ia||state.qr?.cotation_ia;
    if(table && typeof table==="string"){
      const obj={};
      table.split(",").forEach(piece=>{ const m=piece.trim().match(/^([^:]+):\s*([0-9])\s*(€)?$/i); if(m) obj[m[1].trim()]={score:Number(m[2]),paid:!!m[3]}; });
      table=obj;
    }
    if(!table||typeof table!=="object") return;
    Object.entries(table).forEach(([name,val])=>{
      const meta=typeof val==="number"?{score:val}:(val||{});
      const score=Number(meta.score||0);
      if(score<=1) return;
      const btn=document.createElement("button");
      btn.className="ia-btn "+(score===3?"green":"orange");
      btn.textContent=name+(meta.paid?" (version payante)":"");
      btn.addEventListener("click",()=>openIA(name,meta));
      iaButtons.appendChild(btn);
    });
  }
  function openIA(name,meta){
    const prompt=compiledPrompt.value||"";
    const key=(name||"").toLowerCase();
    const template=meta.url||DEFAULT_IA_URLS[key]||"https://chat.openai.com/?q=%q%";
    const url=template.replace("%q%",encodeURIComponent(prompt));
    window.open(url,"_blank");
  }

  function resetApp(){
    stopCamera(); hideScanUI(); hideError();
    state.qr=null;
    ficheMeta.textContent="Aucune fiche scannée";
    infosComplementaires.innerHTML="";
    compiledPrompt.value="";
    iaButtons.innerHTML="";
    formFields.innerHTML="";
    if(qrFile) qrFile.value="";
    if(lastImportedObjectURL){ URL.revokeObjectURL(lastImportedObjectURL); lastImportedObjectURL=null; }
    hideEl(successMsg);
    ensureExtraInfoField();
  }

  document.addEventListener("DOMContentLoaded",()=>{
    const span=document.getElementById("appVersion"); if(span){ span.textContent=" — "+APP_VERSION; span.style.opacity=.9; }
  });

  cameraBtn?.addEventListener("click", startCamera);
  scanBtn?.addEventListener("click", detectQRCode);
  resetBtn?.addEventListener("click", resetApp);
  btnGenerate?.addEventListener("click", generatePromptFromForm);

  resetApp();
})();
