require("dotenv").config();
const http = require("http");

const {
  Client, GatewayIntentBits, ChannelType,
  EmbedBuilder, ActionRowBuilder,
  StringSelectMenuBuilder, ButtonBuilder,
  ButtonStyle, PermissionsBitField,
  ModalBuilder, TextInputBuilder,
  TextInputStyle, SlashCommandBuilder,
  REST, Routes,
  ActivityType
} = require("discord.js");

const { createTranscript } = require("discord-html-transcripts");
const config = require("./config");

/* Keep Railway alive */
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("OK");
}).listen(process.env.PORT || 3000);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

/* Crash guards */
process.on("unhandledRejection", err => console.error("unhandledRejection:", err));
process.on("uncaughtException", err => console.error("uncaughtException:", err));

/* Auto-clear ephemeral messages safely */
function autoClear(interaction, seconds = 20) {
  setTimeout(() => {
    try {
      if (interaction.editReply) {
        interaction.editReply({ content: "\u200B", components: [] }).catch(() => {});
      }
    } catch {}
  }, seconds * 1000);
}

/* One-ticket-per-category */
async function hasOpenTicket(guild, userId, type) {
  const channels = await guild.channels.fetch();
  return channels.find(c =>
    c.topic &&
    c.topic.includes(`OPENER:${userId}`) &&
    c.topic.includes(`TYPE:${type}`)
  );
}

/* Slash command */
const commands = [
  new SlashCommandBuilder().setName("panel").setDescription("Post the support panel")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

client.once("ready", async () => {
  console.log("Fuze Studios Ticket Bot Online");

  client.user.setPresence({
    activities: [{ name: "Fuze Studios Tickets", type: ActivityType.Watching }],
    status: "online"
  });

  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );
});

/* Panel helpers */
function panelEmbed() {
  return new EmbedBuilder()
    .setColor(config.embedColor)
    .setTitle(config.panel.title)
    .setDescription(config.panel.description);
}

function panelMenu() {
  return new StringSelectMenuBuilder()
    .setCustomId("ticket_select")
    .setPlaceholder("Select a category...")
    .addOptions(config.categories.map(c => ({
      label: c.label,
      emoji: c.emoji,
      value: c.value
    })));
}

client.on("interactionCreate", async (i) => {
  try {

    /* /panel */
    if (i.isChatInputCommand() && i.commandName === "panel") {
      if (!i.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        await i.reply({ content: "No permission.", ephemeral: true });
        autoClear(i);
        return;
      }

      await i.channel.send({
        embeds: [panelEmbed()],
        components: [new ActionRowBuilder().addComponents(panelMenu())]
      });

      await i.reply({ content: "Panel posted.", ephemeral: true });
      autoClear(i);
      return;
    }

    /* Dropdown */
    if (i.isStringSelectMenu() && i.customId === "ticket_select") {
      const choice = i.values[0];

      // Reset menu visually
      await i.message.edit({
        embeds: [panelEmbed()],
        components: [new ActionRowBuilder().addComponents(panelMenu())]
      });

      // Script Support
      if (choice === "support") {
        const existing = await hasOpenTicket(i.guild, i.user.id, "support");
        if (existing) {
          await i.reply({ content: `❌ You already have a Script Support ticket: ${existing}`, ephemeral: true });
          autoClear(i);
          return;
        }

        if (!i.member.roles.cache.has("1447572198494703666")) {
          await i.reply({ content: "❌ You must have the Customer role to open Script Support.", ephemeral: true });
          autoClear(i);
          return;
        }

        const modal = new ModalBuilder().setCustomId("support_form").setTitle("Script Support");
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("script").setLabel("Script Name").setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("version").setLabel("Version").setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("framework").setLabel("Framework").setStyle(TextInputStyle.Short).setRequired(true))
        );

        return i.showModal(modal);
      }

      const existing = await hasOpenTicket(i.guild, i.user.id, choice);
      if (existing) {
        await i.reply({ content: `❌ You already have a ${choice} ticket: ${existing}`, ephemeral: true });
        autoClear(i);
        return;
      }

      await i.reply({ content: "Creating your ticket...", ephemeral: true });
      autoClear(i);
      return createTicket(i, choice, null);
    }

    /* Modal submit */
    if (i.isModalSubmit() && i.customId === "support_form") {
      await i.reply({ content: "Creating your ticket...", ephemeral: true });
      autoClear(i);

      return createTicket(i, "support", {
        script: i.fields.getTextInputValue("script"),
        version: i.fields.getTextInputValue("version"),
        framework: i.fields.getTextInputValue("framework")
      });
    }

    /* Claim */
    if (i.isButton() && i.customId === "claim") {
      if (!i.member.roles.cache.has(config.staffRole)) return;

      await i.deferUpdate();
      const id = Math.floor(Math.random() * 9000) + 1000;
      await i.channel.setName(`${i.user.username}-${id}`);
      await i.channel.send(`**${i.user.username}** has claimed this ticket.`);

      await i.message.edit({
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setLabel(`Claimed by ${i.user.username}`).setStyle(ButtonStyle.Success).setDisabled(true),
          new ButtonBuilder().setCustomId("close").setLabel("Close Ticket").setStyle(ButtonStyle.Danger)
        )]
      });
    }

    /* Close */
    if (i.isButton() && i.customId === "confirm_close") {
      const transcript = await createTranscript(i.channel);

      const openerId = i.channel.topic.split("|")[0].replace("OPENER:", "");
      try { await (await client.users.fetch(openerId)).send({ files: [transcript] }); } catch {}

      await (await client.channels.fetch(process.env.TRANSCRIPT_CHANNEL)).send({ files: [transcript] });
      await i.channel.delete();
    }

  } catch (e) {
    console.error(e);
  }
});

async function createTicket(i, type, form) {
  const data = config.categories.find(c => c.value === type);

  const channel = await i.guild.channels.create({
    name: `ticket-${i.user.username}`,
    topic: `OPENER:${i.user.id} | TYPE:${type}`,
    parent: data.categoryId,
    type: ChannelType.GuildText,
    permissionOverwrites: [
      { id: i.guild.id, deny: ["ViewChannel"] },
      { id: i.user.id, allow: ["ViewChannel", "SendMessages"] },
      { id: config.staffRole, allow: ["ViewChannel", "SendMessages"] }
    ]
  });

  const embed = new EmbedBuilder()
    .setColor("#b7ff00")
    .setAuthor({
      name: "Fuze Tickets",
      iconURL: "https://r2.fivemanage.com/4RmswrT2g81ilzhiPT695/Bazaart_DC3DA98C-1470-45E1-B549-21F02068B249-removebg-preview.png"
    })
    .setDescription(`**Resource:** ${data.label}\n**Opened By:** <@${i.user.id}>`)
    .setFooter({ text: "Fuze Studios Support System" });

  if (type === "support") {
    embed.addFields(
      { name: "Script", value: form.script },
      { name: "Version", value: form.version },
      { name: "Framework", value: form.framework }
    );
  }

  await channel.send({
    content: `<@&${config.staffRole}> <@${i.user.id}>`,
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("claim").setLabel("Claim").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("close").setLabel("Close Ticket").setStyle(ButtonStyle.Danger)
    )]
  });

  await i.followUp({ content: `Ticket created: ${channel}`, ephemeral: true });
  autoClear(i);
}

client.login(process.env.TOKEN);
