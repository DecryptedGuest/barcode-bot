const {
Client,
GatewayIntentBits,
AttachmentBuilder,
REST,
Routes,
SlashCommandBuilder,
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

/* ---------------- CONFIG ---------------- */

const TOKEN = process.env.DISCORD_TOKEN;

const CLIENT_ID = "1474356483574595738";
const GUILD_ID = "1479965805902037004";
const PANEL_ROLE_ID = "1479969872237559898";

const LOG_CHANNEL_ID = "1482471116877594674";

const HISTORY_PAGE_SIZE = 24;

const client = new Client({
intents: [GatewayIntentBits.Guilds]
});

/* ---------------- LOGGING ---------------- */

async function sendLog(client, message) {

try {

const channel =
await client.channels.fetch(
LOG_CHANNEL_ID
);

if (!channel) return;

const timestamp =
new Date().toISOString();

await channel.send({
content:
`[${timestamp}]\n${message}`
});

}
catch(err){
console.error("Log error:", err);
}

}

/* ---------------- HISTORY ---------------- */

const historyPath =
path.join(__dirname, "history.json");

function loadHistory() {
if (!fs.existsSync(historyPath))
return {};
return JSON.parse(
fs.readFileSync(historyPath)
);
}

function saveHistory(data) {
fs.writeFileSync(
historyPath,
JSON.stringify(data, null, 2)
);
}

function addHistory(userId, panelType, entry) {

const history = loadHistory();

if (!history[userId])
history[userId] = [];

history[userId].push({
panelType,
...entry
});

saveHistory(history);

}

function getHistory(userId, panelType) {

const history = loadHistory();

return (history[userId] || [])
.filter(h => h.panelType === panelType)
.slice()
.reverse();

}

/* ---------------- VALIDATION ---------------- */

function isValidHex(hex) {
return /^#?[0-9A-F]{6}$/i.test(hex);
}

/* FIXED IMAGE VALIDATION */

function isValidImageUrl(url) {
return /^https?:\/\/.+/i.test(url);
}

/* TEXT WRAP FUNCTION */

function drawWrappedText(
ctx,
text,
x,
y,
maxWidth,
lineHeight
) {

const words = text.split(" ");
let line = "";
let lines = [];

for (let n = 0; n < words.length; n++) {

const testLine =
line + words[n] + " ";

const metrics =
ctx.measureText(testLine);

const testWidth =
metrics.width;

if (
testWidth > maxWidth &&
n > 0
) {

lines.push(line);
line = words[n] + " ";

}
else {

line = testLine;

}

}

lines.push(line);

/* DRAW LINES */

for (let i = 0; i < lines.length; i++) {

ctx.fillText(
lines[i],
x,
y + (i * lineHeight)
);

}

return lines.length * lineHeight;

}

/* ---------------- BARCODE GENERATOR ---------------- */

async function generateBarcode(product, price, options) {

const canvasWidth = 650;
const padding = 40;

const textZoneHeight = 0;
const priceZoneHeight = 60;
  /* FIXED IMAGE FRAME */

  const imageFrameHeight = 200;
  const imageFrameWidth = canvasWidth - 80;

  let img = null;

  if (options.imageUrl) {

  try {

  const response =
  await fetch(options.imageUrl);

  if (response.ok) {

  const buffer =
  Buffer.from(
  await response.arrayBuffer()
  );

  img =
  await loadImage(buffer);

  }

  }
  catch(err) {

  console.log("Image load failed");

  }

  }

/* CALCULATE SPACE */

const barcodeHeight = 140;

  const canvasHeight =
  padding +
  120 + /* extra text space */
  priceZoneHeight +
  imageFrameHeight +
  barcodeHeight +
  padding;

/* CREATE CANVAS */

const canvas =
createCanvas(
canvasWidth,
canvasHeight
);

const ctx =
canvas.getContext("2d");

ctx.fillStyle = "#ffffff";
ctx.fillRect(
0,
0,
canvasWidth,
canvasHeight
);

let y = padding;

/* TEXT */

  if (options.text) {

  ctx.fillStyle = "#000";
  ctx.font = "28px Arial";
  ctx.textAlign = "center";

  /* WRAPPED TEXT */

  const textHeight =
  drawWrappedText(
  ctx,
  options.text,
  canvasWidth / 2,
  y,
  canvasWidth - 80,
  34
  );

  /* MOVE Y BASED ON TEXT SIZE */

  y += textHeight;

  }

  /* PRICE (SAINS + TESCO FIXED PRICE) */

  ctx.fillStyle = "#000";
  ctx.font = "bold 28px Arial";
  ctx.textAlign = "center";

  let displayPrice = price;

  /* FORCE TESCO PRICE */

  if (options.panelType === "tesco") {

  displayPrice = 4;

  }

  ctx.fillText(
  `£${(displayPrice / 100).toFixed(2)}`,
  canvasWidth / 2,
  y
  );

  y += priceZoneHeight;
  /* IMAGE FRAME */

  const frameX = 40;
  const frameY = y;

  if (img) {

  /* SCALE IMAGE TO FIT FRAME */

  const scale =
  Math.min(
  imageFrameWidth / img.width,
  imageFrameHeight / img.height
  );

  const w = img.width * scale;
  const h = img.height * scale;

  /* CENTER IMAGE IN FRAME */

  const imgX =
  frameX +
  (imageFrameWidth - w) / 2;

  const imgY =
  frameY +
  (imageFrameHeight - h) / 2;

  ctx.drawImage(
  img,
  imgX,
  imgY,
  w,
  h
  );

  }

  /* MOVE Y BELOW FRAME */

  y += imageFrameHeight;

/* BARCODE */

function padLeft(str, len) {
return str.toString().padStart(len, "0");
}

let numericProduct =
product.replace(/\D/g, "") || "0";

numericProduct =
padLeft(numericProduct, 13);

const paddedPrice =
padLeft(price || 0, 6);

const baseNumber =
options.panelType === "tesco"
? `971${numericProduct}70000408`
: `91${numericProduct}${paddedPrice}`;

const barcodeCanvas =
createCanvas(
canvasWidth - 80,
barcodeHeight
);

JsBarcode(
barcodeCanvas,
baseNumber,
{
format: "CODE128",
displayValue: true,
fontSize: 16,
width: 2,
height: barcodeHeight - 40,
margin: 5,
lineColor:
options.barcodeColor || "#000000"
}
);

/* FIXED CENTERING */

const barcodeX =
(canvasWidth - barcodeCanvas.width) / 2;

ctx.drawImage(
barcodeCanvas,
barcodeX,
y
);

return {
buffer: canvas.toBuffer(),
fullBarcode: baseNumber
};

}

/* ---------------- COMMAND REG ---------------- */

const commands = [

new SlashCommandBuilder()
.setName("sainspanel")
.setDescription("Open Sains panel"),

new SlashCommandBuilder()
.setName("tescopanel")
.setDescription("Open Tesco panel")

].map(c=>c.toJSON());

const rest =
new REST({version:"10"})
.setToken(TOKEN);

(async()=>{

await rest.put(
Routes.applicationGuildCommands(
CLIENT_ID,
GUILD_ID
),
{body:commands}
);

})();

client.on("interactionCreate",
async interaction=>{

try {

  /* ===================== */
  /* SEND TO DM BUTTON */
  /* ===================== */

  if (
  interaction.isButton() &&
  interaction.customId.startsWith("dm_send_")
  ) {

  const parts =
  interaction.customId.split("_");

  const panelType = parts[2];
  const index = parseInt(parts[3]);

  const history =
  getHistory(
  interaction.user.id,
  panelType
  );

  const entry =
  history[index];

  if (!entry) {

  return interaction.reply({
  content:"History not found.",
  ephemeral:true
  });

  }

  const user =
  await client.users.fetch(
  interaction.user.id
  );

  const { buffer } =
  await generateBarcode(
  entry.product,
  entry.price,
  entry
  );

  const deleteRow =
  new ActionRowBuilder()
  .addComponents(

  new ButtonBuilder()
  .setCustomId("delete_dm_barcode")
  .setLabel("Delete")
  .setStyle(ButtonStyle.Danger)

  );

  await user.send({

  files:[
  new AttachmentBuilder(
  buffer,
  { name:"barcode.png" }
  )
  ],

  components:[deleteRow]

  });

  return interaction.reply({
  content:"Sent to your DMs.",
  ephemeral:true
  });

  }

/* DELETE DM IMAGE */

if (
interaction.isButton() &&
interaction.customId === "delete_dm_barcode"
) {

await interaction.message.delete();
return;

}

/* COMMAND */

if (interaction.isChatInputCommand()) {

if (
!interaction.member.roles.cache
.has(PANEL_ROLE_ID)
) {

return interaction.reply({
content:"No permission.",
ephemeral:true
});

}

const panelType =
interaction.commandName==="tescopanel"
? "tesco"
: "sains";

const row =
new ActionRowBuilder()
.addComponents(

new ButtonBuilder()
.setCustomId(
`generate_${panelType}`
)
.setLabel("Generate")
.setStyle(ButtonStyle.Primary),

new ButtonBuilder()
.setCustomId(
`history_${panelType}_0`
)
.setLabel("History")
.setStyle(ButtonStyle.Secondary)

);

return interaction.reply({
content:
`${panelType.toUpperCase()} PANEL`,
components:[row]
});

}

/* BUTTON HANDLING */

if (interaction.isButton()) {

const parts =
interaction.customId.split("_");

const action = parts[0];
const panelType = parts[1];

/* GENERATE BUTTON */

if (action === "generate") {

const modal =
new ModalBuilder()
.setCustomId(
`modal_${panelType}`
)
.setTitle("Generate Barcode");

const product =
new TextInputBuilder()
.setCustomId("product")
.setLabel("EAN-13 Barcode")
.setStyle(TextInputStyle.Short)
.setRequired(true);

modal.addComponents(
new ActionRowBuilder().addComponents(product)
);

if (panelType === "sains") {

const price =
new TextInputBuilder()
.setCustomId("price")
.setLabel("Price (pence)")
.setStyle(TextInputStyle.Short)
.setRequired(true);

modal.addComponents(
new ActionRowBuilder().addComponents(price)
);

}

const text =
new TextInputBuilder()
.setCustomId("text")
.setLabel("Text - Optional")
.setStyle(TextInputStyle.Short)
.setRequired(false);

const image =
new TextInputBuilder()
.setCustomId("image")
.setLabel("Image URL - Optional")
.setStyle(TextInputStyle.Short)
.setRequired(false);

const colour =
new TextInputBuilder()
.setCustomId("colour")
.setLabel("Barcode Hex - Optional")
.setStyle(TextInputStyle.Short)
.setRequired(false);

modal.addComponents(
new ActionRowBuilder().addComponents(text),
new ActionRowBuilder().addComponents(image),
new ActionRowBuilder().addComponents(colour)
);

return interaction.showModal(modal);

}

/* HISTORY BUTTON */

if (action === "history") {

const history =
getHistory(
interaction.user.id,
panelType
);

if (!history.length) {

return interaction.reply({
content: "No history found.",
ephemeral: true
});

}

const options =
history.slice(0,24).map((h,i)=>({

  label:
  (h.fullBarcode || "Barcode").substring(0,25),

value:
String(i)

}));

const select =
new StringSelectMenuBuilder()
.setCustomId(
`select_${panelType}`
)
.addOptions(options);

return interaction.reply({

content: "Select history:",

components: [
new ActionRowBuilder()
.addComponents(select)
],

ephemeral: true

});

}

}

  /* ===================== */
  /* HISTORY SELECT MENU */
  /* ===================== */

  if (interaction.isStringSelectMenu()) {

  const panelType =
  interaction.customId.split("_")[1];

  const history =
  getHistory(
  interaction.user.id,
  panelType
  );

  const index =
  parseInt(interaction.values[0]);

  const entry =
  history[index];

  if (!entry) {

  return interaction.reply({
  content:"History not found.",
  ephemeral:true
  });

  }

  const { buffer } =
  await generateBarcode(
  entry.product,
  entry.price,
  entry
  );

  /* CREATE DM BUTTON */

  const dmRow =
  new ActionRowBuilder()
  .addComponents(

  new ButtonBuilder()
  .setCustomId(
  `dm_send_${panelType}_${index}`
  )
  .setLabel("Send to DMs")
  .setStyle(ButtonStyle.Success)

  );

  return interaction.reply({

  files:[
  new AttachmentBuilder(
  buffer,
  { name:"barcode.png" }
  )
  ],

  components:[dmRow],

  ephemeral:true

  });

  }
  
/* MODAL SUBMIT */

if (interaction.isModalSubmit()) {

const panelType =
interaction.customId.split("_")[1];

const product =
interaction.fields.getTextInputValue("product");

const text =
interaction.fields.getTextInputValue("text");

const image =
interaction.fields.getTextInputValue("image");

const colour =
interaction.fields.getTextInputValue("colour");

let price = 0;

if (panelType === "sains") {

price =
interaction.fields
.getTextInputValue("price");

}

  if (panelType === "tesco") {

  price = 4; // Always £0.04

  }

if (
image &&
!isValidImageUrl(image)
) {

return interaction.reply({
content: "Invalid image URL.",
ephemeral: true
});

}

const { buffer, fullBarcode } =
await generateBarcode(
product,
price,
{
text,
imageUrl: image,
barcodeColor: colour,
panelType
}
);

addHistory(
interaction.user.id,
panelType,
{
product,
price,
text,
imageUrl: image,
barcodeColor: colour,
fullBarcode
}
);

  /* GET LAST HISTORY INDEX */

  const history =
  getHistory(
  interaction.user.id,
  panelType
  );

  const historyIndex =
  history.length - 1;

  /* SAFE SHORT CUSTOM ID */

  const dmRow =
  new ActionRowBuilder()
  .addComponents(

  new ButtonBuilder()
  .setCustomId(
  `dm_send_${panelType}_${historyIndex}`
  )
  .setLabel("Send to DMs")
  .setStyle(ButtonStyle.Success)

  );

return interaction.reply({

files: [
new AttachmentBuilder(
buffer,
{ name: "barcode.png" }
)
],

components:[dmRow],

ephemeral: true

});

}

}

catch(err){

console.error(err);

if(
!interaction.replied
&& !interaction.deferred
){

interaction.reply({
content:"Error occurred.",
ephemeral:true
});

}

}

});

/* KEEP ALIVE */

const app = express();

app.get("/",(req,res)=>{
res.send("Bot alive");
});

app.listen(3000);

client.login(TOKEN);
