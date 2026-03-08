const { Client, GatewayIntentBits, AttachmentBuilder, REST, Routes, SlashCommandBuilder } = require('discord.js');
const { createCanvas, loadImage, registerFont } = require('canvas');
const JsBarcode = require('jsbarcode');

// Register a font (keep the path for your system)
registerFont('C:/Windows/Fonts/arial.ttf', { family: 'Arial' }); 

// Read token from environment variable
const TOKEN = process.env.DISCORD_TOKEN; 
const CLIENT_ID = "1474356483574595738";
const GUILD_ID = "1439667549745971213";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Helper functions
function padLeft(str, length) {
  return str.toString().padStart(length, '0');
}

function calculateCheckDigit(input) {
  let sum = 0;
  for (let i = 0; i < input.length; i++) {
    const digit = parseInt(input[input.length - 1 - i], 10);
    const weight = (i % 2 === 0) ? 3 : 1;
    sum += digit * weight;
  }
  return (10 - (sum % 10)) % 10;
}

function formatPrice(pence) {
  return (pence / 100).toFixed(2); 
}

// Register slash commands
const commands = [
  new SlashCommandBuilder()
    .setName('barcode')
    .setDescription('Generate a barcode')
    .addStringOption(option =>
      option.setName('productbarcode')
        .setDescription('Product barcode')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('price')
        .setDescription('Price in pence (e.g. 10 = £0.10)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('text')
        .setDescription('Optional - Text above barcode')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('imageurl')
        .setDescription('Optional - Image above barcode')
        .setRequired(false))
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
})();

// Handle interactions
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'barcode') {
    const product = interaction.options.getString('productbarcode');
    const price = interaction.options.getInteger('price');
    const text = interaction.options.getString('text') || null;
    const imageUrl = interaction.options.getString('imageurl') || null;

    const productDigits = padLeft(product, 13);
    const paddedPrice = padLeft(price, 6);
    const baseNumber = `91${productDigits}${paddedPrice}`;
    const checkDigit = calculateCheckDigit(baseNumber);
    const fullBarcode = `${baseNumber}${checkDigit}`;

    const canvasWidth = 600;
    const barcodeHeight = 150;
    const priceHeight = 50;
    const textHeight = text ? 50 : 0;
    let imageHeight = 0;
    let imageWidth = 0;

    let image = null;
    if (imageUrl) {
      try {
        image = await loadImage(imageUrl);
        const maxImageWidth = canvasWidth - 40;
        imageWidth = Math.min(maxImageWidth, image.width);
        imageHeight = (image.height / image.width) * imageWidth;

        const maxImageHeight = 200;
        if (imageHeight > maxImageHeight) {
          const scale = maxImageHeight / imageHeight;
          imageHeight = maxImageHeight;
          imageWidth = imageWidth * scale;
        }
      } catch (err) {
        console.log("Failed to load image:", err.message);
        image = null;
        imageHeight = 0;
      }
    }

    const margin = 20;
    const canvasHeight = textHeight + imageHeight + priceHeight + barcodeHeight + margin * 5;
    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let yOffset = margin;

    if (text) {
      ctx.fillStyle = "#000000";
      ctx.font = "bold 28px Arial";
      ctx.textAlign = "center";
      ctx.fillText(text, canvasWidth / 2, yOffset + 24);
      yOffset += textHeight + margin;
    }

    if (image) {
      ctx.drawImage(image, (canvasWidth - imageWidth) / 2, yOffset, imageWidth, imageHeight);
      yOffset += imageHeight + margin;
    }

    ctx.fillStyle = "#000000";
    ctx.font = "bold 28px Arial";
    ctx.textAlign = "center";
    ctx.fillText(formatPrice(price), canvasWidth / 2, yOffset + 28);
    yOffset += priceHeight + margin;

    const barcodeCanvas = createCanvas(canvasWidth, barcodeHeight);
    JsBarcode(barcodeCanvas, fullBarcode, {
      format: "CODE128",
      displayValue: true,
      fontSize: 20,
      width: 3,
      height: 120,
      margin: 10,
      lineColor: "#000000",
      background: "#FFFFFF",
      textMargin: 10,
      textPosition: "bottom"
    });

    ctx.drawImage(barcodeCanvas, (canvasWidth - barcodeCanvas.width) / 2, yOffset);

    await interaction.deferReply();
    const buffer = canvas.toBuffer();
    const attachment = new AttachmentBuilder(buffer, { name: 'barcode.png' });
    await interaction.editReply({ files: [attachment] });
  }
});

client.login(TOKEN);