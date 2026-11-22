const http = require("http");
const fs = require("fs");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require("discord.js");

// 1. HTTP Health Check Server (Required for Render Web Services)
const PORT = process.env.PORT || 10000;
http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("DonutSMP Verification Bot is online!");
  })
  .listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 HTTP server listening on port ${PORT}`);
  });

// 2. Discord Client Setup
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

const DB_FILE = "./verified_users.json";
let db = { config: {}, verified: {}, pending: {} };
if (fs.existsSync(DB_FILE)) {
  db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}
const saveDB = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

// Helper: Formats nickname as "DisplayName [IGN]" within Discord's 32-char limit
function formatBracketNickname(member, ign) {
  const bracket = ` [${ign}]`;
  const maxBaseLength = 32 - bracket.length;
  const baseName = member.user.displayName || member.user.username;
  const trimmedBase = baseName.slice(0, Math.max(1, maxBaseLength));
  return `${trimmedBase}${bracket}`;
}

client.on("interactionCreate", async (interaction) => {
  // --- SLASH COMMANDS ---
  if (interaction.isChatInputCommand()) {
    const { commandName, options, guild, user } = interaction;

    // 1. /verify-setup (Admin)
    if (commandName === "verify-setup") {
      const staffChannel = options.getChannel("staff_channel");
      const verifiedRole = options.getRole("verified_role");
      const unverifiedRole = options.getRole("unverified_role");

      db.config[guild.id] = {
        staffChannelId: staffChannel.id,
        verifiedRoleId: verifiedRole.id,
        unverifiedRoleId: unverifiedRole ? unverifiedRole.id : null,
      };
      saveDB();

      return interaction.reply({
        content: `✅ **Verification Configured!**\n• **Staff Queue:** ${staffChannel}\n• **Verified Role:** ${verifiedRole}\n• **Unverified Role:** ${unverifiedRole || "None"}`,
        ephemeral: true,
      });
    }

    // 2. /verify
    if (commandName === "verify") {
      const cfg = db.config[guild.id];
      if (!cfg) {
        return interaction.reply({
          content: "❌ Verification is not configured yet. Ask an admin to run `/verify-setup`.",
          ephemeral: true,
        });
      }

      if (db.verified[user.id]) {
        return interaction.reply({
          content: `✅ You are already verified as **${db.verified[user.id].ign}** (${db.verified[user.id].edition})!`,
          ephemeral: true,
        });
      }

      const edition = options.getString("edition");
      const rawIgn = options.getString("username").trim();
      const displayIgn = edition === "Bedrock" && !rawIgn.startsWith(".") ? `.${rawIgn}` : rawIgn;

      await interaction.deferReply({ ephemeral: true });

      let avatarUrl = `https://mc-heads.net/avatar/Steve/100`;
      if (edition === "Java") {
        try {
          const res = await fetch(`https://playerdb.co/api/player/minecraft/${encodeURIComponent(rawIgn)}`);
          const data = await res.json();
          if (!data.success) {
            return interaction.editReply(`❌ The Java Minecraft username **${rawIgn}** does not exist. Check your spelling and try again.`);
          }
          avatarUrl = `https://mc-heads.net/avatar/${data.data.player.id}/100`;
        } catch {
          // Continue if API is slow
        }
      }

      // Prevent duplicate IGN claims
      const alreadyClaimed = Object.entries(db.verified).find(
        ([id, info]) => info.ign.toLowerCase() === displayIgn.toLowerCase() && id !== user.id
      );
      if (alreadyClaimed) {
        return interaction.editReply(`❌ **${displayIgn}** is already verified by another member!`);
      }

      db.pending[user.id] = { ign: displayIgn, rawIgn, edition, guildId: guild.id };
      saveDB();

      const staffChannel = guild.channels.cache.get(cfg.staffChannelId);
      if (!staffChannel) {
        return interaction.editReply("❌ Staff review channel not found. Contact an admin.");
      }

      const embed = new EmbedBuilder()
        .setTitle("🛡️ New Minecraft Verification Request")
        .setThumbnail(avatarUrl)
        .addFields(
          { name: "Discord User", value: `${user} (\`${user.id}\`)`, inline: false },
          { name: "Edition", value: edition, inline: true },
          { name: "Minecraft IGN", value: `\`${displayIgn}\``, inline: true }
        )
        .setColor("#F1C40F")
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`approve_${user.id}`)
          .setLabel("Approve")
          .setStyle(ButtonStyle.Success)
          .setEmoji("✅"),
        new ButtonBuilder()
          .setCustomId(`deny_${user.id}`)
          .setLabel("Deny")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("❌")
      );

      await staffChannel.send({ embeds: [embed], components: [row] });

      return interaction.editReply(
        `📨 Your verification request for **${displayIgn}** (${edition}) has been sent to staff!`
      );
    }

    // 3. /mcuser
    if (commandName === "mcuser") {
      const target = options.getUser("user") || user;
      const record = db.verified[target.id];
      if (!record) {
        return interaction.reply({ content: `❌ ${target} is not verified yet.`, ephemeral: true });
      }
      return interaction.reply(`🎮 ${target}'s verified Minecraft IGN is **${record.ign}** (${record.edition}).`);
    }

    // 4. /mcprofile
    if (commandName === "mcprofile") {
      const target = options.getUser("user") || user;
      const record = db.verified[target.id];
      if (!record) {
        return interaction.reply({
          content: `❌ ${target} has not verified their Minecraft account with \`/verify\`.`,
          ephemeral: true,
        });
      }

      const skinName = record.rawIgn || record.ign.replace(/^\./, "");
      const embed = new EmbedBuilder()
        .setTitle(`${record.ign}'s Minecraft Profile`)
        .setDescription(
          `**Discord:** ${target}\n**IGN:** \`${record.ign}\`\n**Edition:** ${record.edition}\n**Status:** ✅ Verified`
        )
        .setThumbnail(`https://mc-heads.net/avatar/${skinName}/100`)
        .setImage(`https://mc-heads.net/body/${skinName}/150`)
        .setColor("#2ECC71");

      return interaction.reply({ embeds: [embed] });
    }

    // 5. /server
    if (commandName === "server") {
      await interaction.deferReply();
      const res = await fetch("https://api.mcsrvstat.us/3/donutsmp.net");
      const data = await res.json();

      const embed = new EmbedBuilder()
        .setTitle("DonutSMP Server Status")
        .setDescription("**Java IP:** `donutsmp.net`\n**Bedrock IP & Port:** `donutsmp.net:19132`")
        .addFields(
          { name: "Status", value: data.online ? "🟢 Online" : "🔴 Offline", inline: true },
          { name: "Players", value: data.online ? `${data.players.online} / ${data.players.max}` : "0", inline: true }
        )
        .setColor("#E67E22");

      return interaction.editReply({ embeds: [embed] });
    }

    // 6. /unverify (Admin)
    if (commandName === "unverify") {
      const target = options.getUser("user");
      if (!db.verified[target.id]) {
        return interaction.reply({ content: `❌ ${target} is not verified.`, ephemeral: true });
      }
      delete db.verified[target.id];
      saveDB();

      const member = await guild.members.fetch(target.id).catch(() => null);
      if (member) await member.setNickname(null).catch(() => {});

      return interaction.reply(`🗑️ Removed verification and reset nickname for ${target}.`);
    }
  }

  // --- STAFF APPROVE / DENY BUTTONS ---
  if (interaction.isButton()) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageNicknames)) {
      return interaction.reply({ content: "❌ Only staff can approve or deny verifications.", ephemeral: true });
    }

    const [action, targetId] = interaction.customId.split("_");
    if (action !== "approve" && action !== "deny") return;

    const req = db.pending[targetId];
    if (!req) {
      return interaction.reply({ content: "⚠️ This request was already handled.", ephemeral: true });
    }

    const cfg = db.config[interaction.guild.id];
    const member = await interaction.guild.members.fetch(targetId).catch(() => null);

    if (action === "approve") {
      db.verified[targetId] = {
        ign: req.ign,
        rawIgn: req.rawIgn,
        edition: req.edition,
        verifiedAt: Date.now(),
      };
      delete db.pending[targetId];
      saveDB();

      if (member && cfg) {
        if (cfg.verifiedRoleId) await member.roles.add(cfg.verifiedRoleId).catch(() => {});
        if (cfg.unverifiedRoleId) await member.roles.remove(cfg.unverifiedRoleId).catch(() => {});

        const bracketNick = formatBracketNickname(member, req.ign);
        await member.setNickname(bracketNick).catch(() => {});

        await member
          .send(`✅ Your Minecraft account **${req.ign}** has been verified in **${interaction.guild.name}**!`)
          .catch(() => {});
      }

      const approvedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setTitle("✅ Verification Approved")
        .setColor("#2ECC71")
        .setFooter({ text: `Approved by ${interaction.user.tag}` });

      return interaction.update({ embeds: [approvedEmbed], components: [] });
    }

    if (action === "deny") {
      delete db.pending[targetId];
      saveDB();

      if (member) {
        await member
          .send(`❌ Your verification request for **${req.ign}** in **${interaction.guild.name}** was denied. Please check your username and run \`/verify\` again.`)
          .catch(() => {});
      }

      const deniedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setTitle("❌ Verification Denied")
        .setColor("#E74C3C")
        .setFooter({ text: `Denied by ${interaction.user.tag}` });

      return interaction.update({ embeds: [deniedEmbed], components: [] });
    }
  }
});

client.once("clientReady", () => {
  console.log(`✅ Minecraft Verification Bot online as ${client.user.tag}`);
});

client.login(process.env.BOT_TOKEN);
        
