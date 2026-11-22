const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const commands = [
  // Player verification
  new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Submit your Minecraft account for verification")
    .addStringOption(opt =>
      opt.setName("edition")
        .setDescription("Java or Bedrock edition")
        .setRequired(true)
        .addChoices(
          { name: "Java Edition", value: "Java" },
          { name: "Bedrock Edition", value: "Bedrock" }
        )
    )
    .addStringOption(opt =>
      opt.setName("username")
        .setDescription("Your exact Minecraft username")
        .setRequired(true)
    ),

  // Check verified IGN (/mcuser)
  new SlashCommandBuilder()
    .setName("mcuser")
    .setDescription("Check a member's verified Minecraft username")
    .addUserOption(opt =>
      opt.setName("user").setDescription("Target member").setRequired(false)
    ),

  // View skin & full MC profile (/mcprofile)
  new SlashCommandBuilder()
    .setName("mcprofile")
    .setDescription("View a player's verified Minecraft skin and profile")
    .addUserOption(opt =>
      opt.setName("user").setDescription("Target member").setRequired(false)
    ),

  // DonutSMP server IP & status (/server)
  new SlashCommandBuilder()
    .setName("server")
    .setDescription("Check DonutSMP server IP and live player count"),

  // Admin setup
  new SlashCommandBuilder()
    .setName("verify-setup")
    .setDescription("Configure staff review channel and verified role")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(opt =>
      opt.setName("staff_channel").setDescription("Channel where staff approve requests").setRequired(true)
    )
    .addRoleOption(opt =>
      opt.setName("verified_role").setDescription("Role given after verification").setRequired(true)
    )
    .addRoleOption(opt =>
      opt.setName("unverified_role").setDescription("Role to remove after verification (optional)").setRequired(false)
    ),

  // Admin unverify
  new SlashCommandBuilder()
    .setName("unverify")
    .setDescription("Remove a member's verification and reset nickname")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
    .addUserOption(opt =>
      opt.setName("user").setDescription("Member to unverify").setRequired(true)
    ),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);

(async () => {
  try {
    console.log("Registering Minecraft & Verification commands...");
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log("✅ All commands registered!");
  } catch (err) {
    console.error(err);
  }
})();
      
