require("dotenv").config();
const http = require("http");

const {
  Client, GatewayIntentBits, ChannelType,
  EmbedBuilder, ActionRowBuilder,
  StringSelectMenuBuilder, ButtonBuilder,
  ButtonStyle, ModalBuilder,
  TextInputBuilder, TextInputStyle,
  SlashCommandBuilder, REST, Routes,
  ActivityType, PermissionsBitField
} = require("discord.js");

const { createTranscript } = require("discord-html-transcripts");
const config = require("./config");

const SUPPORT_ROLE = "1447572189451653120";
const CUSTOMER_ROLE = "1447572198494703666";

/* Keep Railway alive */
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("OK");
}).listen(process.env.PORT || 3000);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

/* Safety */
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

/* Auto clear ephemeral */
function autoClear(i, s = 20) {
  setTimeout(() => {
    i.editReply?.({ content: "\u200B", components: [] }).catch(() => {});
  }, s * 1000);
}

/* One ticket per category */
async function hasOpenTicket(guild, userId, type) {
  const chans = await guild.channels.fetch();
  return chans.find(c =>
    c.topic &&
    c.topic.includes(`OPENER:${userId}`) &&
    c.topic.includes(`TYPE:${type}`)
  );
}

/* Slash command */
const commands = [
  new SlashCommandBuilder().setName("panel").setDescription("Post the ticket panel")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

client.once("ready", async () => {
  client.user.setPresence({
    activities: [{ name: "Fuze Studios Tickets", type: ActivityType.Watching }]
  });

  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );

  console.log("Fuze Tickets Online");
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

client.on("interactionCreate", async i => {
  try {

    /* /panel */
    if (i.isChatInputCommand() && i.commandName === "panel") {
      await i.channel.send({
        embeds: [panelEmbed()],
        components: [new ActionRowBuilder().addComponents(panelMenu())]
      });
      await i.reply({ content: "Panel posted.", ephemeral: true });
      autoClear(i);
    }

    /* Dropdown */
    if (i.isStringSelectMenu() && i.customId === "ticket_select") {
      const type = i.values[0];

      await i.message.edit({
        embeds: [panelEmbed()],
        components: [new ActionRowBuilder().addComponents(panelMenu())]
      });

      if (type === "support") {
        if (!i.member.roles.cache.has(CUSTOMER_ROLE))
          return i.reply({ content: "❌ Customer role required.", ephemeral: true });

        if (await hasOpenTicket(i.guild, i.user.id, "support"))
          return i.reply({ content: "❌ You already have a Script Support ticket.", ephemeral: true });

        const modal = new ModalBuilder()
          .setCustomId("support_form")
          .setTitle("Script Support")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId("script").setLabel("Script Name").setStyle(TextInputStyle.Short).setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId("version").setLabel("Version").setStyle(TextInputStyle.Short).setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId("framework").setLabel("Framework").setStyle(TextInputStyle.Short).setRequired(true)
            )
          );
        return i.showModal(modal);
      }

      if (await hasOpenTicket(i.guild, i.user.id, type))
        return i.reply({ content: `❌ You already have a ${type} ticket.`, ephemeral: true });

      await i.reply({ content: "Creating your ticket...", ephemeral: true });
      autoClear(i);
      return createTicket(i, type, null);
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

    /* Claim (staff only) */
    if (i.isButton() && i.customId === "claim") {
      if (!i.member.roles.cache.has(SUPPORT_ROLE))
        return i.reply({ content: "❌ Staff only.", ephemeral: true });

      await i.deferUpdate();
      await i.channel.setName(`${i.user.username}-${Math.floor(Math.random() * 9000)}`);
      await i.channel.send(`**${i.user.username}** has claimed this ticket.`);

      await i.message.edit({
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel(`✔️ Claimed by ${i.user.username}`).setStyle(ButtonStyle.Success).setDisabled(true),
            new ButtonBuilder().setCustomId("close").setLabel("❌ Close Ticket").setStyle(ButtonStyle.Danger)
          )
        ]
      });
    }

    /* Close */
    if (i.isButton() && i.customId === "close") {
      return i.reply({
        ephemeral: true,
        content: "⚠️ Are you sure you want to close this ticket?",
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("confirm_close").setLabel("Confirm").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId("cancel_close").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
          )
        ]
      });
    }

    if (i.isButton() && i.customId === "cancel_close")
      return i.update({ content: "Cancelled.", components: [] });

    if (i.isButton() && i.customId === "confirm_close") {
      await i.update({ content: "Closing ticket...", components: [] });

      const transcript = await createTranscript(i.channel);
      const openerId = i.channel.topic.split("|")[0].replace("OPENER:", "");

      try {
        const opener = await client.users.fetch(openerId);
        await opener.send({ content: "📄 Your ticket transcript:", files: [transcript] });
      } catch {}

      await (await client.channels.fetch(process.env.TRANSCRIPT_CHANNEL))
        .send({ files: [transcript] });

      await i.channel.delete();
    }

  } catch (e) {
    console.error(e);
  }
});

/* Create ticket */
async function createTicket(i, type, form) {
  const data = config.categories.find(c => c.value === type);

  const ch = await i.guild.channels.create({
    name: `ticket-${i.user.username}`,
    topic: `OPENER:${i.user.id}|TYPE:${type}`,
    parent: data.categoryId,
    type: ChannelType.GuildText,
    permissionOverwrites: [
      { id: i.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: i.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
      { id: SUPPORT_ROLE, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
    ]
  });

  const embed = new EmbedBuilder()
    .setColor("#b7ff00")
    .setTitle("Fuze Tickets")
    .setDescription(`**Resource:** ${data.label}\n**Opened By:** <@${i.user.id}>`)
    .setFooter({
      text: "Fuze Studios Support System",
      iconURL: "https://r2.fivemanage.com/4RmswrT2g81ilzhiPT695/Bazaart_DC3DA98C-1470-45E1-B549-21F02068B249-removebg-preview.png"
    });

  if (type === "support") {
    embed.addFields(
      { name: "Script", value: `\`\`\`\n${form.script}\n\n\n\`\`\`` },
      { name: "Version", value: `\`\`\`\n${form.version}\n\n\n\`\`\`` },
      { name: "Framework", value: `\`\`\`\n${form.framework}\n\n\n\`\`\`` }
    );
  }

  await ch.send({
    content: `<@&${SUPPORT_ROLE}> <@${i.user.id}>`,
    allowedMentions: { roles: [SUPPORT_ROLE], users: [i.user.id] },
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("claim").setLabel("✔️ Claim").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("close").setLabel("❌ Close Ticket").setStyle(ButtonStyle.Danger)
      )
    ]
  });

  await i.followUp({ content: `Ticket created: ${ch}`, ephemeral: true });
  autoClear(i);
}

client.login(process.env.TOKEN);
