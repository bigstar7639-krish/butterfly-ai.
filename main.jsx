import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { marked } from "marked";
import {
  Menu, Plus, MessageSquare, Image as ImageIcon, Search, Paperclip, Mic, Send,
  Sparkles, Settings, Trash2, X, Sun, Moon, Volume2, Copy, Check, PanelLeftClose,
  PanelLeftOpen, Bot, User, Download, FileText, AlertCircle
} from "lucide-react";
import "./style.css";

const API = import.meta.env.VITE_API_URL || "";
const STORE = "butterfly-ai-chats-v1";
const SETTINGS = "butterfly-ai-settings-v1";
const starterPrompts = ["Help me plan my day", "Explain a difficult topic simply", "Write a creative Instagram caption", "Brainstorm an app idea"];

const uid = () => crypto.randomUUID?.() || String(Date.now()) + Math.random();
const newChat = () => ({ id: uid(), title: "New chat", messages: [], updatedAt: Date.now() });
const safeRead = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };

function App() {
  const [chats, setChats] = useState(() => safeRead(STORE, [newChat()]));
  const [activeId, setActiveId] = useState(() => safeRead(STORE, [])[0]?.id || null);
  const [settings, setSettings] = useState(() => safeRead(SETTINGS, { theme: "midnight", effects: true, systemPrompt: "" }));
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sidebar, setSidebar] = useState(true);
  const [mode, setMode] = useState("chat");
  const [modal, setModal] = useState(false);
  const [toast, setToast] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [searchResults, setSearchResults] = useState(null);
  const [imagePrompt, setImagePrompt] = useState("");
  const [generatedImage, setGeneratedImage] = useState("");
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const active = chats.find(c => c.id === activeId) || chats[0];
  const messages = active?.messages || [];

  useEffect(() => { localStorage.setItem(STORE, JSON.stringify(chats)); }, [chats]);
  useEffect(() => {
    localStorage.setItem(SETTINGS, JSON.stringify(settings));
    document.documentElement.dataset.theme = settings.theme || "midnight";
    document.documentElement.dataset.effects = settings.effects === false ? "off" : "on";
  }, [settings]);
  useEffect(() => { if (!activeId && chats[0]) setActiveId(chats[0].id); }, [activeId, chats]);
  useEffect(() => { inputRef.current?.focus(); }, [activeId, mode]);

  const notify = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2600); };
  const updateChat = (id, updater) => setChats(prev => prev.map(c => c.id === id ? updater(c) : c));
  const startChat = () => {
    const c = newChat(); setChats(prev => [c, ...prev]); setActiveId(c.id);
    setMode("chat"); setText(""); setAttachments([]); setSearchResults(null);
  };
  const removeChat = (id, e) => {
    e?.stopPropagation();
    const next = chats.filter(c => c.id !== id);
    if (!next.length) next.push(newChat());
    setChats(next); if (activeId === id) setActiveId(next[0].id);
  };
  const addMessage = (id, message) => updateChat(id, c => ({ ...c, messages: [...c.messages, message], updatedAt: Date.now(), title: c.messages.length ? c.title : message.content.slice(0, 38) || "New chat" }));
  const send = async (override) => {
    const content = (override ?? text).trim();
    if ((!content && !attachments.length) || busy || !active) return;
    const id = active.id;
    const fileText = attachments.map(a => `\n\n[Attached file: ${a.name}]\n${a.content}`).join("");
    const userContent = content + fileText;
    addMessage(id, { id: uid(), role: "user", content: userContent, time: Date.now() });
    setText(""); setAttachments([]); setBusy(true);
    try {
      const history = [...messages, { role: "user", content: userContent }].filter(m => ["user", "assistant"].includes(m.role)).map(m => ({ role: m.role, content: m.content }));
      const res = await fetch(`${API}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history, systemPrompt: settings.systemPrompt }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      updateChat(id, c => ({ ...c, messages: [...c.messages, { id: uid(), role: "assistant", content: data.reply, time: Date.now() }], updatedAt: Date.now() }));
    } catch (e) {
      updateChat(id, c => ({ ...c, messages: [...c.messages, { id: uid(), role: "assistant", content: `⚠️ ${e.message}\n\nCheck your server setup and API key in the README.`, time: Date.now(), error: true }], updatedAt: Date.now() }));
    } finally { setBusy(false); }
  };
  const makeImage = async () => {
    if (!imagePrompt.trim() || busy) return;
    setBusy(true); setGeneratedImage("");
    try {
      const res = await fetch(`${API}/api/image`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: imagePrompt }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "Image generation failed");
      setGeneratedImage(data.image); if (!data.image) throw new Error("No image was returned.");
    } catch(e) { notify(e.message); } finally { setBusy(false); }
  };
  const search = async () => {
    if (!text.trim() || busy) return;
    setBusy(true); setSearchResults(null);
    try {
      const res = await fetch(`${API}/api/search`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: text }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "Search failed");
      setSearchResults(data.results); setText("");
    } catch(e) { notify(e.message); } finally { setBusy(false); }
  };
  const onFiles = async (files) => {
    const accepted = [];
    for (const f of Array.from(files || [])) {
      if (f.size > 2 * 1024 * 1024) { notify(`${f.name} is over 2 MB; skipped.`); continue; }
      if (f.type.startsWith("text/") || /\.(md|json|csv|js|jsx|ts|tsx|html|css|xml)$/i.test(f.name)) {
        accepted.push({ name: f.name, content: await f.text() });
      } else {
        accepted.push({ name: f.name, content: `[File type ${f.type || "unknown"} is attached by name only. Text extraction is not available in this starter.]` });
      }
    }
    setAttachments(prev => [...prev, ...accepted]);
  };
  const voiceInput = () => {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) return notify("Voice input isn't supported in this browser. Try Chrome.");
    const rec = new Speech(); rec.lang = "en-IN"; rec.interimResults = false;
    rec.onresult = e => setText(prev => `${prev}${prev ? " " : ""}${e.results[0][0].transcript}`);
    rec.onerror = () => notify("Couldn't capture voice. Check microphone permission.");
    rec.start();
  };
  const speak = (content) => {
    if (!("speechSynthesis" in window)) return notify("Text-to-speech isn't supported here.");
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(content); u.lang = "en-IN"; window.speechSynthesis.speak(u);
  };
  const copy = async (content) => { await navigator.clipboard?.writeText(content); notify("Copied"); };
  const exportChat = () => {
    const blob = new Blob([messages.map(m => `${m.role.toUpperCase()}\n${m.content}`).join("\n\n---\n\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `${active?.title || "butterfly-chat"}.md`; a.click(); URL.revokeObjectURL(url);
  };
  const rendered = (content) => ({ __html: marked.parse(content || "") });

  return <div className="app-shell">
    {sidebar && <aside className="sidebar">
      <div className="brand-row"><div className="brand-mark"><Sparkles size={19}/></div><span>Butterfly <b>AI</b></span><button className="icon-btn close-side" title="Close sidebar" onClick={()=>setSidebar(false)}><PanelLeftClose size={18}/></button></div>
      <button className="new-chat" onClick={startChat}><Plus size={18}/> New chat <span>⌘ K</span></button>
      <div className="side-label">YOUR CHATS</div>
      <div className="chat-list">{chats.slice().sort((a,b)=>b.updatedAt-a.updatedAt).map(c=><button key={c.id} className={`chat-item ${c.id===activeId?"selected":""}`} onClick={()=>{setActiveId(c.id);setMode("chat");setSearchResults(null);}}>
        <MessageSquare size={16}/><span>{c.title}</span><span className="chat-actions"><button title="Delete chat" onClick={e=>removeChat(c.id,e)}><Trash2 size={14}/></button></span>
      </button>)}</div>
      <div className="sidebar-bottom"><button className="side-action" onClick={()=>setModal(true)}><Settings size={17}/> Settings</button><button className="side-action" onClick={()=>setSettings(s=>({...s,theme:s.theme==="dark"?"light":"dark"}))}>{settings.theme==="dark"?<Sun size={17}/>:<Moon size={17}/>} {settings.theme==="dark"?"Light mode":"Dark mode"}</button><div className="profile"><div className="avatar">B</div><div><b>Butterfly AI</b><small>Personal assistant</small></div><span className="local-pill">Local chats</span></div></div>
    </aside>}
    <main className="main">
      <header className="topbar">{!sidebar&&<button className="icon-btn" onClick={()=>setSidebar(true)} title="Open sidebar"><PanelLeftOpen size={19}/></button>}
        <div className="model-title"><span className="mobile-brand"><Sparkles size={17}/></span>Butterfly AI <span className="model-pill">Assistant</span></div>
        <div className="top-actions"><button className="icon-btn" title="Export chat" onClick={exportChat}><Download size={18}/></button><button className="icon-btn" title="Settings" onClick={()=>setModal(true)}><Settings size={18}/></button></div>
      </header>
      <div className="modebar">
        <button className={mode==="chat"?"active":""} onClick={()=>setMode("chat")}><MessageSquare size={15}/> Chat</button>
        <button className={mode==="image"?"active":""} onClick={()=>setMode("image")}><ImageIcon size={15}/> Create image</button>
        <button className={mode==="search"?"active":""} onClick={()=>{setMode("search");setSearchResults(null);}}><Search size={15}/> Web search</button>
      </div>
      {mode==="chat" ? <section className="conversation">
        {messages.length===0 ? <div className="welcome"><div className="hero-icon"><Sparkles size={30}/></div><h1>What can I help with?</h1><p>Your ideas take flight here.</p><div className="prompt-grid">{starterPrompts.map(p=><button key={p} onClick={()=>send(p)}>{p}<span>↗</span></button>)}</div></div> : <div className="messages">{messages.map(m=><article className={`message ${m.role}`} key={m.id}><div className="message-avatar">{m.role==="assistant"?<Sparkles size={17}/>:<User size={17}/>}</div><div className="message-body"><div className="message-name">{m.role==="assistant"?"Butterfly AI":"You"}</div><div className="markdown" dangerouslySetInnerHTML={rendered(m.content)}/>{m.role==="assistant"&&!m.error&&<div className="message-tools"><button onClick={()=>copy(m.content)}><Copy size={14}/> Copy</button><button onClick={()=>speak(m.content)}><Volume2 size={14}/> Read aloud</button></div>}</div></article>)}{busy&&<article className="message assistant"><div className="message-avatar"><Sparkles size={17}/></div><div className="message-body"><div className="message-name">Butterfly AI</div><div className="typing"><i/><i/><i/></div></div></article>}<div ref={el=>el?.scrollIntoView({behavior:"smooth",block:"end"})}/></div>}
        {searchResults&&<div className="search-results"><h2>Search results</h2>{searchResults.map((r,i)=><a key={i} href={r.url} target="_blank" rel="noreferrer"><b>{r.title}</b><small>{r.url}</small><p>{r.content}</p></a>)}</div>}
      </section> : mode==="image" ? <section className="tool-page"><div className="tool-heading"><div className="hero-icon"><ImageIcon size={26}/></div><h1>Create an image</h1><p>Describe the image you want Butterfly AI to create.</p></div><textarea value={imagePrompt} onChange={e=>setImagePrompt(e.target.value)} placeholder="A cinematic butterfly made of glowing violet stardust, dreamy atmosphere..." rows={4}/><button className="primary-btn" disabled={busy||!imagePrompt.trim()} onClick={makeImage}>{busy?"Creating…":<><Sparkles size={17}/> Generate image</>}</button>{generatedImage&&<div className="generated"><img src={generatedImage} alt={imagePrompt}/><button onClick={()=>{const a=document.createElement("a");a.href=generatedImage;a.download="butterfly-ai-image.png";a.click();}}><Download size={16}/> Save image</button></div>}</section> : <section className="tool-page"><div className="tool-heading"><div className="hero-icon"><Search size={26}/></div><h1>Search the web</h1><p>Find fresh information and source links.</p></div><div className="search-form"><input ref={inputRef} value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&search()} placeholder="What do you want to search for?"/><button className="primary-btn" disabled={busy||!text.trim()} onClick={search}><Search size={17}/> Search</button></div>{searchResults&&<div className="search-results">{searchResults.map((r,i)=><a key={i} href={r.url} target="_blank" rel="noreferrer"><b>{r.title}</b><small>{r.url}</small><p>{r.content}</p></a>)}</div>}</section>}
      {mode==="chat"&&<div className="composer-wrap"><div className="composer">{attachments.length>0&&<div className="attachments">{attachments.map((a,i)=><div className="attachment" key={i}><FileText size={14}/>{a.name}<button onClick={()=>setAttachments(p=>p.filter((_,j)=>j!==i))}><X size={13}/></button></div>)}</div>}<textarea ref={inputRef} value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}} placeholder="Message Butterfly AI…" rows={1}/><div className="composer-actions"><div><button className="icon-btn" title="Attach text file" onClick={()=>fileRef.current?.click()}><Paperclip size={18}/></button><input ref={fileRef} type="file" hidden multiple onChange={e=>onFiles(e.target.files)}/><button className="icon-btn" title="Voice input" onClick={voiceInput}><Mic size={18}/></button><span className="hint">Enter to send · Shift + Enter for newline</span></div><button className="send-btn" disabled={busy||(!text.trim()&&!attachments.length)} onClick={()=>send()}>{busy?<span className="spinner"/>:<Send size={17}/>}</button></div></div><div className="disclaimer">Butterfly AI can make mistakes. Check important information.</div></div>}
    </main>
    {modal&&<div className="modal-backdrop" onClick={()=>setModal(false)}><div className="settings-modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><h2>Settings</h2><button className="icon-btn" onClick={()=>setModal(false)}><X size={18}/></button></div><section className="theme-section"><label>Live theme</label><p>Switch the atmosphere instantly.</p><div className="theme-grid">
          {[["midnight","Midnight"],["aurora","Aurora"],["ocean","Ocean"],["sunset","Sunset"],["rose","Rose"]].map(([id,name])=><button key={id} className={`theme-choice ${settings.theme===id?"chosen":""}`} onClick={()=>setSettings(s=>({...s,theme:id}))}><span className={`theme-swatch ${id}`}/>{name}{settings.theme===id&&<Check size={14}/>}</button>)}
        </div><button className="effects-toggle" onClick={()=>setSettings(s=>({...s,effects:s.effects===false?true:false}))}><span><b>Ambient effects</b><small>Animated glow and floating gradients</small></span><span className={`switch ${settings.effects===false?"off":""}`}><i/></span></button></section>
        <label>Assistant instructions<textarea rows={4} value={settings.systemPrompt} onChange={e=>setSettings(s=>({...s,systemPrompt:e.target.value}))} placeholder="Example: Reply in friendly Tamil-English and keep answers concise."/></label><p className="settings-note">Your chat history and preferences are stored in this browser on this device. API keys belong on the server, never in the frontend.</p><button className="primary-btn" onClick={()=>setModal(false)}>Done</button></div></div>}
    {toast&&<div className="toast"><AlertCircle size={15}/>{toast}</div>}
  </div>;
}

createRoot(document.getElementById("root")).render(<App/>);