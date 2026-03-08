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
  TextInputStyle
} = require('discord.js');

const { createCanvas, loadImage, registerFont } = require('canvas');
const JsBarcode = require('jsbarcode');

registerFont('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', { family: 'Arial' });

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = "1474356483574595738";
const GUILD_ID = "1439667549745971213";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

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
  return "£" + (pence / 100).toFixed(2);
}

async function generateBarcode(product, price, text, imageUrl) {

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

    } catch {
      image = null;
    }
  }

  const margin = 20;

  const canvasHeight =
    textHeight +
    imageHeight +
    priceHeight +
    barcodeHeight +
    margin * 5;

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
    ctx.drawImage(
      image,
      (canvasWidth - imageWidth) / 2,
      yOffset,
      imageWidth,
      imageHeight
    );

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
    margin: 10
  });

  ctx.drawImage(barcodeCanvas, (canvasWidth - barcodeCanvas.width) / 2, yOffset);

  return canvas.toBuffer();
}

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
        .setDescription('Price in pence')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('text')
        .setDescription('Optional text above barcode')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('imageurl')
        .setDescription('Optional image URL')
        .setRequired(false)),

  new SlashCommandBuilder()
    .setName('barcodepanel')
    .setDescription('Send the barcode generator panel')

].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );

})();

client.on('interactionCreate', async interaction => {

  if (interaction.isChatInputCommand()) {

    if (interaction.commandName === 'barcode') {

      const product = interaction.options.getString('productbarcode');
      const price = interaction.options.getInteger('price');
      const text = interaction.options.getString('text');
      const imageUrl = interaction.options.getString('imageurl');

      await interaction.deferReply();

      const buffer = await generateBarcode(product, price, text, imageUrl);

      const attachment = new AttachmentBuilder(buffer, { name: 'barcode.png' });

      await interaction.editReply({ files: [attachment] });

    }

    if (interaction.commandName === 'barcodepanel') {

      const embed = new EmbedBuilder()
        .setTitle("Barcode Generator")
        .setDescription("Press the button below to generate a barcode.")
        .setColor(0x2b2d31);

      const button = new ButtonBuilder()
        .setCustomId("open_barcode_modal")
        .setLabel("Generate Barcode")
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents(button);

      await interaction.reply({
        embeds: [embed],
        components: [row]
      });

    }

  }

  if (interaction.isButton()) {

    if (interaction.customId === "open_barcode_modal") {

      const modal = new ModalBuilder()
        .setCustomId("barcode_modal")
        .setTitle("Generate Barcode");

      const productInput = new TextInputBuilder()
        .setCustomId("productbarcode")
        .setLabel("Product Barcode (EAN13 or 8 digit)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const priceInput = new TextInputBuilder()
        .setCustomId("price")
        .setLabel("Price in pence (example: 199)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const textInput = new TextInputBuilder()
        .setCustomId("text")
        .setLabel("Optional text above barcode")
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      const imageInput = new TextInputBuilder()
        .setCustomId("imageurl")
        .setLabel("Optional image URL")
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      const row1 = new ActionRowBuilder().addComponents(productInput);
      const row2 = new ActionRowBuilder().addComponents(priceInput);
      const row3 = new ActionRowBuilder().addComponents(textInput);
      const row4 = new ActionRowBuilder().addComponents(imageInput);

      modal.addComponents(row1, row2, row3, row4);

      await interaction.showModal(modal);

    }

  }

  if (interaction.isModalSubmit()) {

    if (interaction.customId === "barcode_modal") {

      const product = interaction.fields.getTextInputValue("productbarcode");
      const price = parseInt(interaction.fields.getTextInputValue("price"));
      const text = interaction.fields.getTextInputValue("text") || null;
      const imageUrl = interaction.fields.getTextInputValue("imageurl") || null;

      const buffer = await generateBarcode(product, price, text, imageUrl);

      const attachment = new AttachmentBuilder(buffer, { name: 'barcode.png' });

      await interaction.reply({
        files: [attachment],
        ephemeral: true
      });

    }

  }

});

client.login(TOKEN);
