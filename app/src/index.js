const restify = require("restify");
const CookieParser = require('restify-cookies');
const uuidv4 = require("uuid/v4");
const fetch = require("node-fetch");
const btoa = require("btoa");
const fs = require("fs");
const server = restify.createServer();
server.use(restify.plugins.queryParser());
server.use(CookieParser.parse);
const config = require("./config.js");
const { catchAsync } = require("./utils");
const Discord = require("discord.js");
const client = new Discord.Client();
client.login(config.DISCORD_BOT_TOKEN);
const taNetIDs = config.TA_NETIDS;
const studentNetIDs = config.STUDENT_NETIDS;

// TODO - save authorized users to a db?

let guild = null;
let logChannel = null;
const LOGGING_CHANNEL_ID = "687474608592650253";
const ECE391_GUILD_ID   = "687467865078628375";
client.on("ready", () => {
    guild = client.guilds.get(ECE391_GUILD_ID);
    logChannel = guild.channels.get(LOGGING_CHANNEL_ID);
});


const redirect = encodeURI("https://shib.sigpwny.com/callback/discord");
const shibMap = {};

server.get("/login", (req, res, next) => {
    const session = uuidv4();
    const state = uuidv4();
    shibMap[session] = {
        affiliation: req.header("unscoped-affiliation"),
        netid: req.header("uid"),
        state: state
    }
    console.log(shibMap[session]);

    res.setCookie("session", session, {
        path: "/",
        domain: "shib.sigpwny.com",
        maxAge: 600,
        secure: true,
        httpOnly: true
    });

    res.redirect(`https://discordapp.com/api/oauth2/authorize?client_id=${config.DISCORD_CLIENT_ID}&scope=identify&response_type=code&redirect_uri=${redirect}&state=${state}`, next);
});

server.get("/callback/discord", catchAsync(async (req, res, next) => {
    if (!req.cookies["session"] || !shibMap.hasOwnProperty(req.cookies["session"])) {
        res.send(400, "Not Authenticated With Shibboleth");
        return next();
    }
    if (!req.query.code) {
        res.send(400, "No Code Provided");
        return next();
    }
    if (!req.query.state) {
        res.send(400, "No State Provided");
        return next();
    }
    const shibInfo = shibMap[req.cookies["session"]];
    if (shibInfo.state !== req.query.state) {
        res.send(400, "Invalid State");
        return next();
    }
    const code = req.query.code;
    const creds = btoa(`${config.DISCORD_CLIENT_ID}:${config.DISCORD_CLIENT_SECRET}`);
    const tokenResponse = await fetch(`https://discordapp.com/api/oauth2/token?grant_type=authorization_code&code=${code}&redirect_uri=${redirect}`,
    {
        method: "POST",
        headers: {
          Authorization: `Basic ${creds}`,
        },
    });
    const tokenJson = await tokenResponse.json();

    const userResponse = await fetch(`https://discordapp.com/api/users/@me`,
    {
        method: "GET",
        headers: {
            Authorization: `Bearer ${tokenJson.access_token}`,
        },
    });
    const userJson = await userResponse.json();
    console.log(userJson);
    const user = await client.users.get(userJson.id);
    const member = await guild.member(user);
    if (!member) {        
        res.send(400, "Could not find user in channel - did you join the server yet?");
        return next();
    }
    
    // check for netid in student/TA roster
    if (studentNetIDs.includes(shibInfo.netid)) {
        const studentRole = guild.roles.find(role => role.name === 'Student');
        await member.addRole(studentRole);
	await member.setNickname(shibInfo.netid);
        let message = `Discord account <@${user.id}> authenticated as a student with NetID: ${shibInfo.netid}`;        
        await logChannel.send(message);        
        res.send(200, "Successfully joined as a student!")
    } else if (taNetIDs.includes(shibInfo.netid)) {
        const taRole = guild.roles.find(role => role.name === 'TA');
        await member.addRole(taRole);
	await member.setNickname(shibInfo.netid);
        let message = `Discord account <@${user.id}> authenticated as a TA with NetID: ${shibInfo.netid}`;
        await logChannel.send(message);       
        res.send(200, "Successfully joined as a TA!")
    } else {
        let message = `Discord account <@${user.id}> failed to authenticate with NetID: ${shibInfo.netid}`;
        await logChannel.send(message);
        res.send(400, `${shibInfo.netid} is not in the students/TAs file. This incident will be reported.`);
    }
}));

server.get("/", (req, res, next) => {
    const body = `
    <html>
    <body>
    <p>Authenticate and sign up for the ECE 391 discord</p>
    <p>Information collected: NetID, Discord ID, University Affiliation</p>
    <p>By signing in, you agree to following the univerisity's rules/code of conduct.</p>
    <h1><a href="./login">I AGREE</a></h1>
    <p><small>note: if you were not already signed into discord web, you might have to try again</small></p>
    <p><small><a href="https://github.com/jjwang11/uiuc-shibboleth-auth">Open Source</a></small></p>
    </body>
    </html>
    `;
    res.writeHead(200, {
      'Content-Length': Buffer.byteLength(body),
      'Content-Type': 'text/html'
    });
    res.write(body);
    res.end();
    return next();
});

server.listen(8080, function() {
    console.log('%s listening at %s', server.name, server.url);
});
