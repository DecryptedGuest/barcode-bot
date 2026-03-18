const {
  Client,
  GatewayIntentBits,
  AttachmentBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder
} = require("discord.js");

const { createCanvas, loadImage } = require("canvas");
const JsBarcode = require("jsbarcode");
const fs = require("fs");
const path = require("path");
const express = require("express");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = "1474356483574595738";
const GUILD_ID = "1479965805902037004";
const LOG_CHANNEL_ID = "1482471116877594674";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

/* ---------------- HISTORY ---------------- */
const historyPath = path.join(__dirname, "history.json");

function loadHistory() {
  if (!fs.existsSync(historyPath)) return {};
  return JSON.parse(fs.readFileSync(historyPath));
}

function saveHistory(data) {
  fs.writeFileSync(historyPath, JSON.stringify(data, null, 2));
}

function addHistory(userId, entry) {
  const history = loadHistory();
  if (!history[userId]) history[userId] = [];
  history[userId].push(entry);
  saveHistory(history);
}

function getHistory(userId) {
  const history = loadHistory();
  return (history[userId] || []).slice().reverse(); // recent first
}

/* ---------------- BARCODE ---------------- */
const fetch = require("node-fetch"); // make sure to npm install node-fetch@2

async function generateBarcode(product, price, options) {
const width = 650;
const height = 420;
const canvas = createCanvas(width, height);
const ctx = canvas.getContext("2d");

ctx.fillStyle = options.bgColor || "#ffffff";
ctx.fillRect(0, 0, width, height);

let y = 40;

// --- TEXT WITH WRAPPING ---
if (options.text) {
ctx.fillStyle = options.textColor || "#000000";
let fontSize = 28;
ctx.font = `${fontSize}px Arial`;
ctx.textAlign = "center";

const maxTextWidth = width - 40;
const lines = [];
const words = options.text.split(" ");
let currentLine = "";

for (let word of words) {
  const testLine = currentLine ? currentLine + " " + word : word;
  const metrics = ctx.measureText(testLine);
  if (metrics.width > maxTextWidth) {
    if (currentLine) lines.push(currentLine);
    currentLine = word;
  } else {
    currentLine = testLine;
  }
}
if (currentLine) lines.push(currentLine);

const maxLines = 4; // max lines for text
const displayLines = lines.slice(0, maxLines);

for (let line of displayLines) {
  ctx.fillText(line, width / 2, y);
  y += fontSize + 5;
}

if (lines.length > maxLines) {
  ctx.fillText("…", width / 2, y);
  y += fontSize + 5;
}

y += 10; // extra padding after text
}

// --- IMAGE ---
if (options.imageUrl) {
try {
  const response = await fetch(options.imageUrl);
  if (!response.ok) throw new Error("Image fetch failed");
  const buffer = await response.buffer();
  const img = await loadImage(buffer);

  const imgWidth = 150;
  const imgHeight = 100;
  ctx.drawImage(img, (width - imgWidth) / 2, y, imgWidth, imgHeight);
  y += imgHeight + 30;
} catch (err) {
  console.error("Failed to load image:", err.message);
}
}

// --- PRICE ---
price = parseInt(price);
if (isNaN(price)) price = 0;
ctx.fillStyle = options.textColor || "#000000";
ctx.font = "bold 28px Arial";
ctx.textAlign = "center";
ctx.fillText(`£${(price / 100).toFixed(2)}`, width / 2, y);
y += 50;

// --- BARCODE ---
function padLeft(str, length) { return str.toString().padStart(length, "0"); }
function calculateCheckDigit(input) {
let sum = 0;
for (let i = 0; i < input.length; i++) {
  const digit = parseInt(input[input.length - 1 - i], 10);
  sum += digit * ((i % 2 === 0) ? 3 : 1);
}
return (10 - (sum % 10)) % 10;
}

let numericProduct = product.replace(/\D/g, "") || "0";
numericProduct = padLeft(numericProduct, 13);
const paddedPrice = padLeft(price, 6);
const baseNumber = `91${numericProduct}${paddedPrice}`;
const checkDigit = calculateCheckDigit(baseNumber);
const fullBarcode = `${baseNumber}${checkDigit}`;

// Dynamic barcode scaling based on remaining space
const barcodeHeight = Math.min(120, height - y - 20);
const barcodeCanvas = createCanvas(500, barcodeHeight);
JsBarcode(barcodeCanvas, fullBarcode, {
format: "CODE128",
displayValue: true,
fontSize: 16,
width: 2,
height: barcodeHeight - 40,
margin: 5,
lineColor: options.barcodeColor || "#000000"
});

ctx.drawImage(barcodeCanvas, (width - barcodeCanvas.width) / 2, y);

return canvas.toBuffer();
}

/* ---------------- COMMAND REGISTRATION ---------------- */
const commands = [
  new SlashCommandBuilder()
    .setName("barcodepanel")
    .setDescription("Send the barcode generator panel")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });
    console.log("Cleared old commands.");
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("Registered /barcodepanel command.");
  } catch (error) {
    console.error(error);
  }
})();

/* ---------------- INTERACTIONS ---------------- */
client.on("interactionCreate", async interaction => {
  const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(()=>null);

  /* PANEL */
  if (interaction.isChatInputCommand() && interaction.commandName === "barcodepanel") {
    const embed = new EmbedBuilder()
      .setTitle("Sainsbury's Barcode Generator")
      .setColor("Orange")
      .setDescription("Generate Barcodes or View your History");

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("generate").setLabel("Generate Barcode").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("history").setLabel("View My History").setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ embeds: [embed], components: [row] });
    if (logChannel)
      logChannel.send({ embeds: [ new EmbedBuilder().setColor("Orange").setTitle("Panel Sent").setDescription(`${interaction.user.tag}`).setTimestamp() ] });
  }

  /* BUTTONS */
  if (interaction.isButton()) {

    /* GENERATE MODAL */
    if (interaction.customId === "generate") {
      const modal = new ModalBuilder().setCustomId("barcodeModal").setTitle("Generate Barcode");

      const product = new TextInputBuilder().setCustomId("product").setLabel("Product Barcode").setStyle(TextInputStyle.Short).setRequired(true);
      const price = new TextInputBuilder().setCustomId("price").setLabel("Price in Pence").setStyle(TextInputStyle.Short).setRequired(true);
      const text = new TextInputBuilder().setCustomId("text").setLabel("Text - Optional").setStyle(TextInputStyle.Short).setRequired(false);
      const image = new TextInputBuilder().setCustomId("image").setLabel("Image URL - Optional").setStyle(TextInputStyle.Short).setRequired(false);
      const colour = new TextInputBuilder().setCustomId("colour").setLabel("Barcode Colour (hex) - Optional").setStyle(TextInputStyle.Short).setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(product),
        new ActionRowBuilder().addComponents(price),
        new ActionRowBuilder().addComponents(text),
        new ActionRowBuilder().addComponents(image),
        new ActionRowBuilder().addComponents(colour)
      );

      return interaction.showModal(modal);
    }

    /* VIEW HISTORY */
    if (interaction.customId === "history") {
      const history = getHistory(interaction.user.id);
      if (!history.length) return interaction.reply({ content: "No history yet.", ephemeral: true });

      const options = history.map((h, i) => ({ label: `${i+1}. ${h.product} (£${(h.price/100).toFixed(2)})`, value: String(i) }));
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId("selectHistory").setPlaceholder("Select a code to view details").addOptions(options)
      );

      await interaction.reply({ content: "Select a code:", components: [row], ephemeral: true });
      if (logChannel)
        logChannel.send({ embeds: [ new EmbedBuilder().setColor("Orange").setTitle("History Viewed").setDescription(`${interaction.user.tag}`).setTimestamp() ] });
    }

    /* SEND TO DMs */
    if (interaction.customId.startsWith("senddm_")) {
      const parts = interaction.customId.split("_");
      const userId = parts[1];
      const idx = parseInt(parts[2] ?? -1);

      if (interaction.user.id !== userId) return;

      const historyData = loadHistory();
      const userHistory = historyData[userId] || [];
      let entry;
      if (idx >= 0) entry = userHistory[userHistory.length - 1 - idx];
      else entry = userHistory[userHistory.length - 1];
      if (!entry) return interaction.reply({ content: "No history entry found.", ephemeral: true });

      const buffer = await generateBarcode(entry.product, entry.price, { text: entry.text, imageUrl: entry.imageUrl, barcodeColor: "#000000" });
      const attachment = new AttachmentBuilder(buffer, { name: "barcode.png" });

      entry.inDM = true;
      saveHistory(historyData);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`deletedm_${userId}_${idx}`).setLabel("Delete").setStyle(ButtonStyle.Danger)
      );

      await interaction.user.send({ files: [attachment], components: [row] }).catch(() => {});

      if (!interaction.replied) await interaction.reply({ content: "Sent to your DMs.", ephemeral: true });
      else if (!interaction.deferred) await interaction.editReply({ content: "Sent to your DMs." });

      if (logChannel)
        logChannel.send({ embeds: [ new EmbedBuilder().setColor("Orange").setTitle("Barcode Sent to DM").setDescription(`${interaction.user.tag} sent a barcode to DMs.`).setTimestamp() ] });
    }

    /* DELETE DM */
    if (interaction.customId.startsWith("deletedm_")) {
      const parts = interaction.customId.split("_");
      const userId = parts[1];
      const idx = parseInt(parts[2] ?? -1);

      const historyData = loadHistory();
      const userHistory = historyData[userId] || [];
      let entry;
      if (idx >= 0) entry = userHistory[userHistory.length - 1 - idx];
      else entry = userHistory[userHistory.length - 1];
      if (entry) entry.inDM = false;
      saveHistory(historyData);

      await interaction.message.delete().catch(() => {});
    }
  }

  /* MODAL SUBMIT */
  if (interaction.isModalSubmit() && interaction.customId === "barcodeModal") {
    const product = interaction.fields.getTextInputValue("product");
    const price = parseInt(interaction.fields.getTextInputValue("price"));
    const text = interaction.fields.getTextInputValue("text");
    const image = interaction.fields.getTextInputValue("image");
    const colour = interaction.fields.getTextInputValue("colour");

    const buffer = await generateBarcode(product, price, { text, imageUrl: image, barcodeColor: colour || "#000000" });
    const attachment = new AttachmentBuilder(buffer, { name: "barcode.png" });

    addHistory(interaction.user.id, { product, price, text, imageUrl: image, time: Date.now(), inDM: false });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`senddm_${interaction.user.id}`).setLabel("Send to My DMs").setStyle(ButtonStyle.Success)
    );

    await interaction.reply({ content: "Barcode Generated Successfully:", files: [attachment], components: [row], ephemeral: true });

    if (logChannel)
      logChannel.send({ embeds: [ new EmbedBuilder().setColor("Orange").setTitle("Barcode Generated").setDescription(`${interaction.user.tag}\nProduct: ${product}\nPrice: £${(price/100).toFixed(2)}`).setImage("attachment://barcode.png").setTimestamp() ], files: [attachment] });
  }

  /* HISTORY SELECT */
  if (interaction.isStringSelectMenu() && interaction.customId === "selectHistory") {
    const idx = parseInt(interaction.values[0]);
    const history = getHistory(interaction.user.id);
    const entry = history[idx];

    const buffer = await generateBarcode(entry.product, entry.price, { text: entry.text, imageUrl: entry.imageUrl, barcodeColor: "#000000" });
    const attachment = new AttachmentBuilder(buffer, { name: "barcode.png" });

    const embed = new EmbedBuilder()
      .setTitle(`Barcode Info: ${entry.product}`)
      .setColor("Orange")
      .addFields(
        { name: "Product", value: entry.product, inline: true },
        { name: "Price", value: `£${(entry.price/100).toFixed(2)}`, inline: true },
        { name: "Text", value: entry.text || "None", inline: true },
        { name: "Image URL", value: entry.imageUrl || "None", inline: true },
        { name: "In DMs", value: entry.inDM ? "Yes" : "No", inline: true }
      )
      .setImage("attachment://barcode.png");

    const sendRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`senddm_${interaction.user.id}_${idx}`).setLabel("Send to My DMs").setStyle(ButtonStyle.Success)
    );

    // Remove old senddm buttons from existing components
    const newComponents = interaction.message.components.map(r => {
      const filtered = r.components.filter(c => !c.customId.startsWith("senddm_"));
      return new ActionRowBuilder().addComponents(filtered);
    }).filter(r => r.components.length > 0);

    newComponents.unshift(sendRow);

    await interaction.update({ embeds: [embed], files: [attachment], components: newComponents });
  }
}); // End of interactionCreate

/* LOGIN */
client.login(TOKEN);

/* WEB SERVER */
const app = express();
app.get("/", (req, res) => res.send("Barcode bot running"));
app.listen(process.env.PORT || 3000, () => console.log("Web server running."));