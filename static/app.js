const $ = (selector) => document.querySelector(selector);
const state = {
  conversationId: null,
  sending: false,
  attachment: null,
  config: {},
  settings: JSON.parse(localStorage.getItem("canvas-settings") || "{}"),
};

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}
function markdown(text) {
  let safe = escapeHtml(text);
  safe = safe.replace(
    /```([\w-]*)\n([\s\S]*?)```/g,
    "<pre><code>$2</code></pre>",
  );
  safe = safe
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return safe
    .split(/\n\n+/)
    .map((part) =>
      part.startsWith("<pre>") ? part : `<p>${part.replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(el.timer);
  el.timer = setTimeout(() => el.classList.remove("show"), 3500);
}
function currentProvider() {
  return state.settings.provider || "openai";
}

async function loadConfig() {
  state.config = await fetch("/api/config").then((r) => r.json());
  if (!state.settings.provider) {
    const active = Object.entries(state.config).find(
      ([, config]) => config.active,
    );
    if (active) state.settings.provider = active[0];
  }
  updateSettingsUI();
}
async function loadHistory() {
  const items = await fetch("/api/conversations").then((r) => r.json());
  $("#history").innerHTML = items
    .map(
      (c) =>
        `<div class="history-item ${c.id === state.conversationId ? "active" : ""}" data-id="${c.id}"><button class="history-title">${escapeHtml(c.title)}</button><button class="history-delete" title="Delete">&#10005;</button></div>`,
    )
    .join("");
}
async function openConversation(id) {
  const data = await fetch(`/api/conversations/${id}`).then((r) => r.json());
  state.conversationId = id;
  $("#messages").innerHTML = "";
  data.messages.forEach((m) => addMessage(m.role, m.content));
  await loadHistory();
  $("#sidebar").classList.remove("open");
  scrollBottom();
}
function newChat() {
  state.conversationId = null;
  $("#messages").innerHTML =
    `<div class="welcome" id="welcome">${window.welcomeMarkup}</div>`;
  bindSuggestions();
  loadHistory();
}
function addMessage(role, content, typing = false) {
  $("#welcome")?.remove();
  const el = document.createElement("article");
  el.className = `message ${role}`;
  el.innerHTML = `<div class="message-avatar">${role === "user" ? "YOU" : "C"}</div><div class="message-content ${typing ? "typing" : ""}">${markdown(content)}</div>`;
  $("#messages").append(el);
  scrollBottom();
  return el.querySelector(".message-content");
}
function scrollBottom() {
  const box = $("#messages");
  requestAnimationFrame(() => (box.scrollTop = box.scrollHeight));
}
function autoGrow() {
  const el = $("#message-input");
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
}

async function sendMessage(event) {
  event?.preventDefault();
  const input = $("#message-input");
  const message = input.value.trim();
  if (!message || state.sending) return;
  state.sending = true;
  $("#send-button").disabled = true;
  addMessage("user", message);
  input.value = "";
  autoGrow();
  const assistant = addMessage("assistant", "", true);
  let full = "";
  const payload = {
    conversation_id: state.conversationId,
    message,
    provider: currentProvider(),
    model: state.settings.chatModel || null,
    system_prompt: state.settings.systemPrompt || null,
    temperature: Number(state.settings.temperature ?? 0.7),
    image: state.attachment,
  };
  clearAttachment();
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok)
      throw new Error((await response.json()).detail || "Request failed");
    const reader = response.body.getReader(),
      decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop();
      for (const part of parts) {
        if (!part.startsWith("data: ")) continue;
        const item = JSON.parse(part.slice(6));
        if (item.type === "meta") state.conversationId = item.conversation_id;
        if (item.type === "delta") {
          full += item.content;
          assistant.innerHTML = markdown(full);
          scrollBottom();
        }
        if (item.type === "error") throw new Error(item.message);
      }
    }
  } catch (error) {
    assistant.innerHTML = `<p><strong>Request failed:</strong> ${escapeHtml(error.message)}</p>`;
    toast(error.message);
  } finally {
    assistant.classList.remove("typing");
    state.sending = false;
    $("#send-button").disabled = false;
    loadHistory();
  }
}

function bindSuggestions() {
  document.querySelectorAll("[data-prompt]").forEach(
    (button) =>
      (button.onclick = () => {
        $("#message-input").value = button.dataset.prompt;
        sendMessage();
      }),
  );
}
function clearAttachment() {
  state.attachment = null;
  $("#image-upload").value = "";
  $("#attachment-preview").innerHTML = "";
}
function updateSettingsUI() {
  const config = state.config[currentProvider()] || {};
  $("#provider").value = currentProvider();
  $("#api-key").value = "";
  $("#base-url").value =
    config.base_url ||
    (currentProvider() === "openai" ? "https://api.openai.com/v1" : "");
  $("#chat-model").value = state.settings.chatModel || config.chat_model || "";
  $("#image-model").value =
    state.settings.imageModel || config.image_model || "";
  $("#temperature").value = state.settings.temperature ?? 0.7;
  $("#temperature-output").value = state.settings.temperature ?? 0.7;
  $("#system-prompt").value = state.settings.systemPrompt || "";
  $("#provider-status").textContent = config.configured
    ? `${currentProvider() === "openai" ? "OpenAI" : "Compatible provider"} is configured${config.active ? " and active" : ""}. Enter a key only to replace it.`
    : "Enter the provider details, then test and activate.";
}

async function generateImage(event) {
  event.preventDefault();
  const button = $("#generate-button");
  button.disabled = true;
  button.textContent = "Generating...";
  $("#image-stage").innerHTML =
    '<div class="stage-empty"><span>&#10022;</span><strong>Creating your image...</strong><small>This can take up to a minute.</small></div>';
  try {
    const response = await fetch("/api/images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: $("#image-prompt").value,
        provider: currentProvider(),
        model: state.settings.imageModel || null,
        size: $("#image-size").value,
        quality: $("#image-quality").value,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Image generation failed");
    $("#image-stage").innerHTML =
      `<div class="image-result"><img class="generated-image" src="${data.url}" alt="Generated image"><a class="download-link" href="${data.url}" download="canvas-ai.png">Download image</a></div>`;
  } catch (error) {
    $("#image-stage").innerHTML =
      `<div class="stage-empty"><strong>Generation failed</strong><small>${escapeHtml(error.message)}</small></div>`;
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Generate image";
  }
}

window.welcomeMarkup = $("#welcome").innerHTML;
$("#chat-form").addEventListener("submit", sendMessage);
$("#message-input").addEventListener("input", autoGrow);
$("#message-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
$("#new-chat").onclick = newChat;
$("#open-sidebar").onclick = () => $("#sidebar").classList.add("open");
$("#close-sidebar").onclick = () => $("#sidebar").classList.remove("open");
$("#history").onclick = async (e) => {
  const item = e.target.closest(".history-item");
  if (!item) return;
  if (e.target.closest(".history-delete")) {
    await fetch(`/api/conversations/${item.dataset.id}`, { method: "DELETE" });
    if (state.conversationId === item.dataset.id) newChat();
    else loadHistory();
  } else openConversation(item.dataset.id);
};
document.querySelectorAll(".mode").forEach(
  (button) =>
    (button.onclick = () => {
      document
        .querySelectorAll(".mode")
        .forEach((x) => x.classList.remove("active"));
      button.classList.add("active");
      $("#chat-view").classList.toggle(
        "hidden",
        button.dataset.mode !== "chat",
      );
      $("#image-view").classList.toggle(
        "hidden",
        button.dataset.mode !== "image",
      );
    }),
);
$("#image-upload").onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 205 * 1024 * 1024) return toast("Image must be under 205 MB");
  const reader = new FileReader();
  reader.onload = () => {
    state.attachment = reader.result;
    $("#attachment-preview").innerHTML =
      `<img src="${reader.result}" alt="Attachment"><button class="remove-attachment">&#10005;</button>`;
    $(".remove-attachment").onclick = clearAttachment;
  };
  reader.readAsDataURL(file);
};
$("#settings-button").onclick = () => {
  updateSettingsUI();
  $("#settings-modal").classList.remove("hidden");
};
$("#close-settings").onclick = () =>
  $("#settings-modal").classList.add("hidden");
$("#provider").onchange = (e) => {
  state.settings.provider = e.target.value;
  updateSettingsUI();
};
$("#temperature").oninput = (e) =>
  ($("#temperature-output").value = e.target.value);
$("#save-settings").onclick = async () => {
  const button = $("#save-settings"),
    provider = $("#provider").value,
    apiKey = $("#api-key").value.trim();
  if (!apiKey)
    return toast("Enter the API key to test and activate this provider");
  if (!$("#chat-model").value.trim()) return toast("Enter a chat model name");
  button.disabled = true;
  button.textContent = "Testing connection...";
  try {
    const response = await fetch("/api/providers/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        api_key: apiKey,
        base_url: $("#base-url").value.trim() || null,
        chat_model: $("#chat-model").value.trim(),
        image_model: $("#image-model").value.trim() || null,
      }),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.detail || "Provider activation failed");
    state.settings = {
      provider,
      chatModel: "",
      imageModel: "",
      temperature: Number($("#temperature").value),
      systemPrompt: $("#system-prompt").value.trim(),
    };
    localStorage.setItem("canvas-settings", JSON.stringify(state.settings));
    await loadConfig();
    $("#settings-modal").classList.add("hidden");
    toast(`Provider activated. ${data.models_found} models found.`);
  } catch (error) {
    toast(error.message);
    $("#provider-status").textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "Test & activate provider";
  }
};
$("#image-form").addEventListener("submit", generateImage);
bindSuggestions();
loadConfig().catch(() => toast("Could not load server configuration"));
loadHistory();
