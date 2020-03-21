/**
 * Used for the gamelist-filtering.
 */
const g_MapSizes = prepareForDropdown(g_Settings && g_Settings.MapSizes);

/**
 * Used for the gamelist-filtering.
 */
const g_MapTypes = prepareForDropdown(g_Settings && g_Settings.MapTypes);

/**
 * Used for civ settings display of the selected game.
 */
const g_CivData = loadCivData(false, false);

/**
 * A symbol which is prepended to the username of moderators.
 */
var g_ModeratorPrefix = "@";

const g_EngineInfo = Engine.GetEngineInfo();

/**
 * Current username. Cannot contain whitespace.
 */
const g_Username = Engine.LobbyGetNick();

/**
 * Lobby server address to construct host JID.
 */
const g_LobbyServer = Engine.ConfigDB_GetValue("user", "lobby.server");

/**
 * Current games will be listed in these colors.
 */
var g_GameColors = {
	"init":    { "style": {}, "buddyStyle": {} },
	"waiting": { "style": {}, "buddyStyle": {} },
	"running": { "style": {}, "buddyStyle": {} },
	"incompatible": { "style": { "color": "128 128 128" }, "buddyStyle": { "color": "160 160 160" } }
};

/**
 * Initial sorting order of the gamelist.
 */
var g_GameStatusOrder = Object.keys(g_GameColors);

/**
 * The playerlist will be assembled using these values.
 */
var g_PlayerStatuses = {
	"available": { "style": {}, "buddyStyle": {} , "status": translate("Online") },
	"away":      { "style": {}, "buddyStyle": {} , "status": translate("Away") },
	"playing":   { "style": {}, "buddyStyle": {} , "status": translate("Busy") },
	"offline":   { "style": {}, "buddyStyle": {} , "status": translate("Offline") },
	"unknown":   { "style": {}, "buddyStyle": {} , "status": translateWithContext("lobby presence", "Unknown") }
};

/**
 * Style for indicating the user in the playerlist and the game where he is listed.
 */
var g_UserStyle;

/**
 * Configuration auto away.
 */
var g_AutoAway = {
	"timeMinutes": +Engine.ConfigDB_GetValue("user", "lobby.autoawaytime"),
	"time": false,
	"background": false,
	"timeInBackground": false,
	"timerHandler": 0,
	"applied": false
};

/**
 * Different states for presence and auto-away feature.
 * Called as function due to configurable g_AutoAway.timeMinutes.
 */
var g_AutoAwayStates = [
	{
		"name": "available",
		"desc": () => translate("Available"),
		"func": () => setPlayerPresence("available", false, false, false)
	},
	{
		"name": "away",
		"desc": () => translate("Away"),
		"func": () => setPlayerPresence("away", false, false, false)
	},
	{
		"name": "available_awaytime",
		"desc": () => sprintf(translate("Away after %(minutes)s %(minute)s"),
		{
			"minutes": g_AutoAway.timeMinutes,
			"minute": translatePlural("minute", "minutes", g_AutoAway.timeMinutes)
		}),
		"func": () => setPlayerPresence("available", true, false, false)
	}
];

/**
 * Indicator for window focus state.
 */
var g_WindowFocus = true;

/**
 * Presence change, after timeout apply latest.
 */
var g_Presence = {
	"timer": 0,
	"setNew": "",
	"timeoutMilliSeconds": 500
};

var g_RoleNames = {
	"moderator": translate("Moderator"),
	"participant": translate("Player"),
	"visitor": translate("Muted Player")
};

/**
 * Color for error messages in the chat.
 */
var g_SystemColor = "150 0 0";

/**
 * Color for private messages in the chat.
 */
var g_PrivateMessageColor = "0 150 0";

/**
 * Used for highlighting the sender of chat messages.
 */
var g_SenderFont = "sans-bold-13";

/**
 * Color to highlight chat commands in the explanation.
 */
var g_ChatCommandColor = "200 200 255";

/**
 * Indicates if the lobby is opened as a dialog or window.
 */
var g_Dialog = false;

/**
 * All chat messages received since init (i.e. after lobby join and after returning from a game).
 */
var g_ChatMessages = [];

/**
 * Rating of the current user.
 * Contains the number or an empty string in case the user has no rating.
 */
var g_UserRating = "";

/**
 * All games currently running.
 */
var g_GameList = [];

/**
 * All players in the lobby.
 */
var g_PlayerList = [];

/**
 * Set gamelist column sort.
 */
var g_GamesSort = [];

/**
 * Set playerlist column sort.
 */
var g_PlayersSort = [];

/**
 * Used to restore the selection after updating the playerlist.
 */
var g_SelectedPlayer = "";

/**
 * Used to restore the selection after updating the gamelist.
 */
var g_SelectedGameIP = "";

/**
 * Used to restore the selection after updating the gamelist.
 */
var g_SelectedGamePort = "";
var g_SelectedGameName = "";

/**
 * Whether the current user has been kicked or banned.
 */
var g_Kicked = false;

/**
 * Whether the player was already asked to reconnect to the lobby.
 * Ensures that no more than one message box is opened at a time.
 */
var g_AskedReconnect = false;

var g_CallbackSet = false;

var g_InGame = false;

/**
 * Manage stacked cancel hotkey. Call first true condition onPress function.
 */
let g_CancelHotkey = [
	() => setLeaderboardVisibility(false),
	() => setUserProfileVisibility(false)
];

var g_OptionsPage = "Lobby";

/**
 * Store civilization code and page (structree or history) opened in civilization info.
 */
var g_CivInfo = {
	"code": "",
	"page": "page_structree.xml"
};

/**
 * List of more buttons bar below the chat input.
 */
var g_MoreButtonsBarFuncs = {
	"Replays": () => Engine.PushGuiPage("page_replaymenu.xml", { "ingame": g_InGame, "dialog": true, "callback": "startReplay" }),
	"Last Summary": { "func": showLastGameSummary, "tooltip": "Show complete last " + setStringTags("summary", { "color": "yellow" }) + " (if not disconnected during game)." },
	"Civilizations": { "func": openCivInfo, "tooltip": colorizeHotkey("Press %(hotkey)s to open structure tree.", "structree") },
	"Options": { "func": openGameOptions, "tooltip": colorizeHotkey("Press %(hotkey)s to open options.", "options") }
};

function openCivInfo()
{
	Engine.PushGuiPage(g_CivInfo.page, { "civ": g_CivInfo.code, "callback": "storeCivInfoPage" });
}

function openGameOptions()
{
	Engine.PushGuiPage("page_options.xml", {
		"selectedCategory": g_OptionsPage || "Lobby",
		"callback": "initUserConfigurables"
	})
}

/**
 * Processing of notifications sent by XmppClient.cpp.
 *
 * @returns true if the playerlist GUI must be updated.
 */
var g_NetMessageTypes = {
	"system": {
		// Three cases are handled in prelobby.js
		"registered": msg => false,
		"connected": msg => {

			g_AskedReconnect = false;
			updateConnectedState();
			return false;
		},
		"disconnected": msg => {

			updateGameList();
			updateLeaderboard();
			updateConnectedState();

			if (!g_Kicked)
			{
				addChatMessage({
					"from": "system",
					"time": msg.time,
					"text": translate("Disconnected.") + " " + msg.reason
				});
				reconnectMessageBox();
			}

			return !msg.historic;
		},
		"error": msg => {
			addChatMessage({
				"from": "system",
				"time": msg.time,
				"text": msg.text
			});
			return false;
		}
	},
	"chat": {
		"subject": msg => {
			updateSubject(msg.subject);

			if (msg.nick)
				addChatMessage({
					"text": "/special " + sprintf(translate("%(nick)s changed the lobby subject to %(subject)s"), {
						"nick": msg.nick,
						"subject": msg.subject
					}),
					"time": msg.time,
					"isSpecial": true,
					"historic": msg.historic
				});
			return false;
		},
		"join": msg => {
			addChatMessage({
				"text": "/special " + sprintf(translate("%(nick)s has joined."), {
					"nick": msg.nick
				}),
				"time": msg.time,
				"isSpecial": true,
				"historic": msg.historic
			});
			return !msg.historic;
		},
		"leave": msg => {
			addChatMessage({
				"text": "/special " + sprintf(translate("%(nick)s has left."), {
					"nick": msg.nick
				}),
				"time": msg.time,
				"isSpecial": true,
				"historic": msg.historic
			});

			if (msg.nick == g_Username)
				Engine.DisconnectXmppClient();

			return !msg.historic;
		},
		"presence": msg => !msg.historic,
		"role": msg => {
			Engine.GetGUIObjectByName("chatInput").hidden = Engine.LobbyGetPlayerRole(g_Username) == "visitor";

			let me = g_Username == msg.nick;
			let newrole = Engine.LobbyGetPlayerRole(msg.nick);
			let txt =
				newrole == "visitor" ?
					me ?
						translate("You have been muted.") :
						translate("%(nick)s has been muted.") :
				newrole == "moderator" ?
					me ?
						translate("You are now a moderator.") :
						translate("%(nick)s is now a moderator.") :
				msg.oldrole == "visitor" ?
					me ?
						translate("You have been unmuted.") :
						translate("%(nick)s has been unmuted.") :
					me ?
						translate("You are not a moderator anymore.") :
						translate("%(nick)s is not a moderator anymore.");

			addChatMessage({
				"text": "/special " + sprintf(txt, { "nick": msg.nick }),
				"time": msg.time,
				"isSpecial": true,
				"historic": msg.historic
			});

			if (g_SelectedPlayer == msg.nick)
				updateUserRoleText(g_SelectedPlayer);

			return false;
		},
		"nick": msg => {
			addChatMessage({
				"text": "/special " + sprintf(translate("%(oldnick)s is now known as %(newnick)s."), {
					"oldnick": msg.oldnick,
					"newnick": msg.newnick
				}),
				"time": msg.time,
				"isSpecial": true,
				"historic": msg.historic
			});
			return !msg.historic;
		},
		"kicked": msg => {
			handleKick(false, msg.nick, msg.reason, msg.time, msg.historic);
			return !msg.historic;
		},
		"banned": msg => {
			handleKick(true, msg.nick, msg.reason, msg.time, msg.historic);
			return !msg.historic;
		},
		"room-message": msg => {
			addChatMessage({
				"from": escapeText(msg.from),
				"text": escapeText(msg.text),
				"time": msg.time,
				"historic": msg.historic
			});
			return false;
		},
		"private-message": msg => {
			// Announcements and the Message of the Day are sent by the server directly
			if (!msg.from)
				messageBox(
					400, 250,
					msg.text.trim(),
					translate("Notice")
				);

			// We intend to not support private messages between users
			if (!msg.from || Engine.LobbyGetPlayerRole(msg.from) == "moderator")
				// some XMPP clients send trailing whitespace
				addChatMessage({
					"from": escapeText(msg.from || "system"),
					"text": escapeText(msg.text.trim()),
					"time": msg.time,
					"historic": msg.historic,
					"private": true
				});
			return false;
		}
	},
	"game": {
		"gamelist": msg => {
			updateGameList(g_AutoScrollGameListFromSelection);
			g_AutoScrollGameListFromSelection = false;
			return false;
		},
		"profile": msg => {
			updateProfile();
			return false;
		},
		"leaderboard": msg => {
			updateLeaderboard();
			return false;
		},
		"ratinglist": msg => {
			return !msg.historic;
		}
	}
};

/**
 * Remembering Away Option when go "/away" and "/back"
 */
var g_SavedAwayOption = 0;

/**
 * Commands that can be entered by clients via chat input.
 * A handler returns true if the user input should be sent as a chat message.
 */
var g_ChatCommands = {
	"away": {
		"description": translate("Set your state to 'Away'."),
		"handler": args => {
			Engine.LobbySetPlayerPresence("away");
			let presenceDropdown = Engine.GetGUIObjectByName("presenceDropdown");
			g_SavedAwayOption = presenceDropdown.selected;
			presenceDropdown.selected = g_AutoAwayStates.findIndex(opt => opt.name == "away");
			return false;
		}
	},
	"back": {
		"description": translate("Set your state to 'Online'."),
		"handler": args => {
			Engine.LobbySetPlayerPresence("available");
			Engine.GetGUIObjectByName("presenceDropdown").selected = g_SavedAwayOption;
			return false;
		}
	},
	"kick": {
		"description": translate("Kick a specified user from the lobby. Usage: /kick nick reason"),
		"handler": args => {
			Engine.LobbyKick(args[0] || "", args[1] || "");
			return false;
		},
		"moderatorOnly": true
	},
	"ban": {
		"description": translate("Ban a specified user from the lobby. Usage: /ban nick reason"),
		"handler": args => {
			Engine.LobbyBan(args[0] || "", args[1] || "");
			return false;
		},
		"moderatorOnly": true
	},
	"help": {
		"description": translate("Show this help."),
		"handler": args => {
			let isModerator = Engine.LobbyGetPlayerRole(g_Username) == "moderator";
			let text = translate("Chat commands:");
			for (let command in g_ChatCommands)
				if (!g_ChatCommands[command].moderatorOnly || isModerator)
					// Translation: Chat command help format
					text += "\n" + sprintf(translate("%(command)s - %(description)s"), {
						"command": coloredText(command, g_ChatCommandColor),
						"description": g_ChatCommands[command].description
					});

			addChatMessage({
				"from": "system",
				"text": text
			});
			return false;
		}
	},
	"showip": {
		"description": translate("Show ip and port of the selected game from the gamelist."),
		"handler": args =>  {

			let gamesBox = Engine.GetGUIObjectByName("gameList");
			if (gamesBox.selected > -1)
			{
				let game = g_GameList[gamesBox.selected];
				let ip = game.stunIP ? game.stunIP : game.ip;
				let port = game.stunPort ? game.stunPort : game.port;
				addChatMessage({
					"from": "system",
					"text": "IP from " + escapeText(game.name) + ": " + ip + ":" + port
				});
			}
			return false;
		}
	},
	"me": {
		"description": translate("Send a chat message about yourself. Example: /me goes swimming."),
		"handler": args => true
	},
	"say": {
		"description": translate("Send text as a chat message (even if it starts with slash). Example: /say /help is a great command."),
		"handler": args => true
	},
	"clear": {
		"description": translate("Clear all chat scrollback."),
		"handler": args => {
			clearChatMessages();
			return false;
		}
	},
	"quit": {
		"description": translate("Return to the main menu."),
		"handler": args => {
			leaveLobby();
			return false;
		}
	}
};

function clearPlayerSelectionTooltip(show)
{
	Engine.GetGUIObjectByName("playerList").tooltip =
		show ? '' + setStringTags(escapeText("[Escape]"), { "color": "yellow" }) + " clear selection"
		: "";
}

function clearGameSelectionTooltip(show)
{
	Engine.GetGUIObjectByName("gameList").tooltip =
	show ? '' + setStringTags(escapeText("[Escape]"), { "color": "yellow" }) + " clear selection"
		: "";
}

var g_AutoScrollGameListFromSelection = false;

var g_FocusObj = {
	list: [],
	switchCheck: [],
	localTabHotkey: [],
	ptr: -1
}

function focusSwitch()
{
	// warn(g_FocusObj.list.length)
	// warn(g_FocusObj.ptr);
	if (g_FocusObj.ptr >= 0)
	{
		if (!g_FocusObj.switchCheck[g_FocusObj.ptr](g_FocusObj.list[g_FocusObj.ptr]))
		{
		g_FocusObj.localTabHotkey[g_FocusObj.ptr]();
		return;
		}
	}

	++g_FocusObj.ptr;
	// warn(g_FocusObj.ptr);
	g_FocusObj.ptr = g_FocusObj.ptr >= g_FocusObj.list.length ? 0 : g_FocusObj.ptr;
	g_FocusObj.list[g_FocusObj.ptr].focus();
}

function initFocusSwitcher()
{
	for (let i in [ "chatInput", "playerList", "gameList" ])
	{
		// warn(i)
		g_FocusObj.list.push(Engine.GetGUIObjectByName(i));
	}
	g_FocusObj.switchCheck.push(obj => { warn("K"); return !obj.caption.length; });
	g_FocusObj.localTabHotkey.push(obj => { warn("j"); autoCompleteNick(this, g_PlayerList.map(player => player.name).concat(
		Object.keys(g_ChatCommands).sort().map(com => { return "/" + com; })))});
	g_FocusObj.switchCheck.push(() => true);
	g_FocusObj.switchCheck.push(() => true);
	// warn(g_FocusObj.list.length)
}

/**
 * Called after the XmppConnection succeeded and when returning from a game.
 *
 * @param {Object} attribs
 */
function init(attribs = {})
{
	g_Dialog = !!attribs.dialog;
	g_InGame = !!attribs.ingame;
	g_SelectedGameIP = !!attribs.game_ip ? attribs.game_ip : "";
	g_SelectedGamePort = !!attribs.game_port ? attribs.game_port : "";
	g_SelectedGameName = !!attribs.game_name ? attribs.game_name : "";
	g_AutoScrollGameListFromSelection = !!attribs.game_ip || !!attribs.game_name;
	if (g_SelectedGameIP || g_SelectedGameName)
		g_CancelHotkey.splice(2, 0, setGameListBoxUnselected)

	if (!g_Settings)
	{
		leaveLobby();
		return;
	}
	clearPlayerSelectionTooltip(false);

	g_CallbackSet = !!attribs.callback;
	readConfigStatusColors();
	initMusic();
	global.music.setState(global.music.states.MENU);

	initDialogStyle();
	g_GamesSort = initGUIListSort("gameList", "lobby.sort.games");
	initGameFilters();
	updateConnectedState();

	initAutoAway();

	// When rejoining the lobby after a game, we don't need to process presence changes
	Engine.LobbyClearPresenceUpdates();
	g_PlayersSort = initGUIListSort("playerList", "lobby.sort.players");
	updatePlayerList();
	updateSubject(Engine.LobbyGetRoomSubject());
	initUserConfigurables();

	updateToggleBuddy();
	Engine.GetGUIObjectByName("chatInput").tooltip =
		colorizeAutocompleteHotkey("Press %(hotkey)s to focus chat input and keep pressing %(hotkey)s to cycle through all autocompleting playernames or /-commands.\nEnter " + setStringTags("/help", { "color": "yellow"}) + " for all /-commands.");

	// Get all messages since the login
	for (let msg of Engine.LobbyGuiPollHistoricMessages())
		g_NetMessageTypes[msg.type][msg.level](msg);

	if (!Engine.IsXmppClientConnected())
		reconnectMessageBox();

	if (attribs && attribs.joinGame)
		Engine.PushGuiPage("page_gamesetup_mp.xml", attribs.joinGame);
	else if (attribs && attribs.startReplay)
		startReplay(attribs.startReplay);
	initFocusSwitcher();
	Engine.GetGUIObjectByName("hostButton").tooltip = colorizeHotkey("%(hotkey)s for new Game", "lobby.newgame");
}

function startReplay(data)
{
	if (data && g_Dialog)
		Engine.PopGuiPageCB({ "goGUI": [ "page_lobby.xml", { "startReplay": data } ] });
	else if (data && !!data.replayDirectory && data.page)
	{
		if (!Engine.StartVisualReplay(data.replayDirectory))
		{
			warn('Replay "' + escapeText(Engine.GetReplayDirectoryName(replayDirectory)) + '" not found! Please click on reload cache.');
			return;
		}
		Engine.SwitchGuiPage(...data.page);
	}
}

function reconnectMessageBox()
{
	if (g_AskedReconnect)
		return;

	g_AskedReconnect = true;

	messageBox(
		400, 200,
		translate("You have been disconnected from the lobby. Do you want to reconnect?"),
		translate("Confirmation"),
		[translate("No"), translate("Yes")],
		[null, Engine.ConnectXmppClient]);
}

/**
 * Set style of GUI elements and the window style.
 */
function initDialogStyle()
{
	let lobbyWindow = Engine.GetGUIObjectByName("lobbyWindow");
	lobbyWindow.sprite = g_Dialog ? "ModernDialog" : "ModernWindow";
	lobbyWindow.size = g_Dialog ? "42 42 100%-42 100%-42" : "0 0 100% 100%";
	Engine.GetGUIObjectByName("lobbyWindowTitle").size = g_Dialog ? "50%-128 -16 50%+128 16" : "50%-128 4 50%+128 36";

	Engine.GetGUIObjectByName("leaveButton").caption = g_Dialog ?
		translateWithContext("previous page", "Back") :
		translateWithContext("previous page", "Main Menu");

	Engine.GetGUIObjectByName("hostButton").hidden = g_Dialog;
	Engine.GetGUIObjectByName("joinGameButton").hidden = g_Dialog;
	Engine.GetGUIObjectByName("gameInfoEmpty").size = "0 0 100% 100%-24" + (g_Dialog ? "" : "-30");
	Engine.GetGUIObjectByName("gameInfo").size = "0 0 100% 100%-24" + (g_Dialog ? "" : "-60");

	Engine.GetGUIObjectByName("middlePanel").size = "20%+5 " + (g_Dialog ? "18" : "40") + " 100%-255 100%-20";
	Engine.GetGUIObjectByName("rightPanel").size = "100%-250 " + (g_Dialog ? "18" : "40") + " 100%-20 100%-20";
	setLeftPanelExpanded(true);

	if (g_Dialog)
	{
		Engine.GetGUIObjectByName("lobbyDialogToggle").onPress = leaveLobby;
		g_CancelHotkey.push(leaveLobby);

		Engine.GetGUIObjectByName("chatInput").focus();
	}
}

/**
 * Set style of GUI elements according to the connection state of the lobby.
 */
function updateConnectedState()
{
	Engine.GetGUIObjectByName("chatInput").hidden = !Engine.IsXmppClientConnected();
	Engine.GetGUIObjectByName("presenceDropdown").enabled = Engine.IsXmppClientConnected();

	for (let button of ["host", "leaderboard", "userprofile", "toggleBuddy"])
		Engine.GetGUIObjectByName(button + "Button").enabled = Engine.IsXmppClientConnected();
}

function readConfigStatusColors()
{
	for (let i in g_GameColors)
	{
		g_GameColors[i].style = { "color": isValidColor(Engine.ConfigDB_GetValue("user", "lobby.statuscolors.games." + i)) };
		g_GameColors[i].buddyStyle = { "color": isValidColor(Engine.ConfigDB_GetValue("user", "lobby.statuscolors.games.buddy." + i)) };
	}

	for (let i in g_PlayerStatuses)
	{
		g_PlayerStatuses[i].style = { "color": isValidColor(Engine.ConfigDB_GetValue("user", "lobby.statuscolors.players." + i)) };
		g_PlayerStatuses[i].buddyStyle = { "color": isValidColor(Engine.ConfigDB_GetValue("user", "lobby.statuscolors.players.buddy." + i)) };
	}

	g_UserStyle = { "color": isValidColor(Engine.ConfigDB_GetValue("user", "lobby.userplayer.color")) };
}

/**
 * Initiate presences dropdown and configurable auto away time minutes.
 */
function initAutoAway()
{
	let presenceDropdown = Engine.GetGUIObjectByName("presenceDropdown");
	presenceDropdown.list = g_AutoAwayStates.map(state => state.desc());
	presenceDropdown.list_data = g_AutoAwayStates.map(state => state.name);
	presenceDropdown.selected = (presenceDropdown.list_data.findIndex(data => data == Engine.ConfigDB_GetValue("user", "lobby.presenceselection"))
		+ 1 || 1) - 1;
}

function initUserConfigurables(data)
{
	g_OptionsPage = data && data.page;

	updateLobbyColumns();
	initGUIMoreButtonsBar();
	g_AutoAway.timeMinutes = +Engine.ConfigDB_GetValue("user", "lobby.autoawaytime");
	initAutoAway();
}

function initGUIMoreButtonsBar()
{
	let showConfig = Engine.ConfigDB_GetValue("user", "gui.lobby.morebuttonsbar");

	Engine.GetGUIObjectByName("moreOptionsBarActionHide").onmouseenter =
		showConfig == "hiding" ? () => setMoreButtonsBarVisibility(false, true) : () => true;
	Engine.GetGUIObjectByName("moreOptionsBarActionShow").onmouseenter =
		showConfig == "hiding" ? () => setMoreButtonsBarVisibility(true, true) : () => true;

	setMoreButtonsBarVisibility(showConfig == "visible", showConfig == "hiding");

	if (showConfig == "disabled")
		return;

	let buttonWidthPercentton = (1 / Object.keys(g_MoreButtonsBarFuncs).length) * 100;

	let j = -1;
	for (let i in g_MoreButtonsBarFuncs)
	{
		let button = Engine.GetGUIObjectByName("moreButtons[" + ++j + "]");
		button.hidden = false;
		// Let gap "+2" between buttons and calculate size to fit space
		button.size = j * buttonWidthPercentton + "%" + (j > 0 ? "+2" : "") + " 100%-25 " +
			((j + 1) * buttonWidthPercentton) + "%" + " 100%";

		button.caption = i;
		button.onpress = g_MoreButtonsBarFuncs[i].func || g_MoreButtonsBarFuncs[i];
		button.tooltip = g_MoreButtonsBarFuncs[i].tooltip || "";
	}
}

function setMoreButtonsBarVisibility(show, autoHideAble)
{
	Engine.GetGUIObjectByName("moreOptionsBarActionHide").hidden = !(autoHideAble && show);
	Engine.GetGUIObjectByName("chatPanel").size = show ? "0 49% 100% 100%-29" : "0 49% 100% 100%"
	Engine.GetGUIObjectByName("moreButtons").hidden = !show;
}

function updateLobbyColumns()
{
	let gameRating = Engine.ConfigDB_GetValue("user", "lobby.columns.gamerating") == "true";

	// Only show the selected columns
	let gamesBox = Engine.GetGUIObjectByName("gameList");
	gamesBox.hidden_mapType = gameRating;
	gamesBox.hidden_gameRating = !gameRating;

	// Only show the filters of selected columns
	let mapTypeFilter = Engine.GetGUIObjectByName("mapTypeFilter");
	mapTypeFilter.hidden = gameRating;
	let gameRatingFilter = Engine.GetGUIObjectByName("gameRatingFilter");
	gameRatingFilter.hidden = !gameRating;

	// Keep filters right above the according column
	let playersNumberFilter = Engine.GetGUIObjectByName("playersNumberFilter");
	let size = playersNumberFilter.size;
	size.rleft = gameRating ? 74 : 90;
	size.rright = gameRating ? 84 : 100;
	playersNumberFilter.size = size;
}

function leaveLobby()
{
	if (g_AutoAway.timerHandler)
		clearTimeout(g_AutoAway.timerHandler);

	if (g_Dialog)
	{
		Engine.LobbySetPlayerPresence("playing");

		if (g_CallbackSet)
			Engine.PopGuiPageCB();
		else
			Engine.PopGuiPage();
	}
	else
	{
		Engine.StopXmppClient();
		saveSettingAndWriteToUserConfig("lobby.loggedin", "false");
		Engine.SwitchGuiPage("page_pregame.xml"); //, { showPreLobby: Engine.ConfigDB_GetValue("user", "lobby.autologin") == "true" });
	}
}

/**
 * Apply lobby player presence and save it in user config.
 */
function applyPlayerPresence(presence)
{
	Engine.LobbySetPlayerPresence(presence);
	let dropdown = Engine.GetGUIObjectByName("presenceDropdown");
	Engine.ConfigDB_CreateValue("user", "lobby.presenceselection", dropdown.list_data[dropdown.selected]);
	Engine.ConfigDB_WriteValueToFile("user", "lobby.presenceselection", dropdown.list_data[dropdown.selected], "config/user.cfg");
}

/**
 * Apply lobby presence for player.
 * 500ms timeouts between multiple presence changes. After timeout applies latest presence change.
 *
 * @param {string} presence - Presence string for user. ("available", "away", "busy")
 * @param {bool} awayTime - Optional auto away when time g_AutoAway.timeMinutes inactive.
 * @param {bool} awayBackground - Optional auto away when window looses focus.
 * @param {bool} awayTimeInBackground - Optional auto away when time inactive while window is unfocused.
 */
function setPlayerPresence(presence, awayTime, awayBackground, awayTimeInBackground)
{
	g_AutoAway.time = awayTime;
	g_AutoAway.background = awayBackground;
	g_AutoAway.timeInBackground = awayTimeInBackground;
	resetAutoAway();

	// When timeout, store presence.
	if (g_Presence.timer)
		g_Presence.setNew = presence;
	else
	{
		applyPlayerPresence(presence);
		g_Presence.setNew = "";
		// Start timeout for next presence apply.
		g_Presence.timer = setTimeout(() => {
			if (g_Presence.setNew)
				applyPlayerPresence(g_Presence.setNew);
			g_Presence.timer = 0;
			}, g_Presence.timeoutMilliSeconds);
	}
}

function handleInputAfterGui(ev)
{
	// Wait for window focus to reset auto away.
	if (g_WindowFocus) // ev.type != "mousemotion" &&
		resetAutoAway();

	return false;
}

function setAutoAway()
{
	Engine.LobbySetPlayerPresence("away");
	g_AutoAway.applied = true;
}

function resetAutoAway()
{
	if (g_AutoAway.applied)
	{
		Engine.LobbySetPlayerPresence("available");
		g_AutoAway.applied = false;
	}

	if (g_AutoAway.timerHandler)
		clearTimeout(g_AutoAway.timerHandler);

	if (g_AutoAway.time && (!g_AutoAway.timeInBackground || !g_WindowFocus))
		g_AutoAway.timerHandler = setTimeout(setAutoAway, 1000 * 60 * g_AutoAway.timeMinutes);

	if (g_AutoAway.background && !g_AutoAway.timeInBackground && !g_WindowFocus)
		setAutoAway();
}

function initGameFilters()
{
	let mapSizeFilter = Engine.GetGUIObjectByName("mapSizeFilter");
	mapSizeFilter.list = [translateWithContext("map size", "Any")].concat(g_MapSizes.Name);
	mapSizeFilter.list_data = [""].concat(g_MapSizes.Tiles);

	let playersArray = Array(g_MaxPlayers).fill(0).map((v, i) => i + 1); // 1, 2, ... MaxPlayers
	let playersNumberFilter = Engine.GetGUIObjectByName("playersNumberFilter");
	playersNumberFilter.list = [translateWithContext("player number", "Any")].concat(playersArray);
	playersNumberFilter.list_data = [""].concat(playersArray);

	let mapTypeFilter = Engine.GetGUIObjectByName("mapTypeFilter");
	mapTypeFilter.list = [translateWithContext("map", "Any")].concat(g_MapTypes.Title);
	mapTypeFilter.list_data = [""].concat(g_MapTypes.Name);

	let gameRatingOptions = [">1500", ">1400", ">1300", ">1200", "<1200", "<1100", "<1000"];
	gameRatingOptions = prepareForDropdown(gameRatingOptions.map(r => ({
		"value": r,
		"label": sprintf(
			r[0] == ">" ?
				translateWithContext("gamelist filter", "> %(rating)s") :
				translateWithContext("gamelist filter", "< %(rating)s"),
			{ "rating": r.substr(1) })
	})));

	let gameRatingFilter = Engine.GetGUIObjectByName("gameRatingFilter");
	gameRatingFilter.list = [translateWithContext("map", "Any")].concat(gameRatingOptions.label);
	gameRatingFilter.list_data = [""].concat(gameRatingOptions.value);

	resetFilters();
}

function resetFilters()
{
	Engine.GetGUIObjectByName("mapSizeFilter").selected = 0;
	Engine.GetGUIObjectByName("playersNumberFilter").selected = 0;
	Engine.GetGUIObjectByName("mapTypeFilter").selected = g_MapTypes.Default;
	Engine.GetGUIObjectByName("gameRatingFilter").selected = 0;
	Engine.GetGUIObjectByName("filterOpenGames").checked = false;

	applyFilters();
}

function applyFilters()
{
	updateGameList();
	updateGameSelection();
}

/**
 * Filter a game based on the status of the filter dropdowns.
 *
 * @param {Object} game
 * @returns {boolean} - True if game should not be displayed.
 */
function filterGame(game)
{
	let mapSizeFilter = Engine.GetGUIObjectByName("mapSizeFilter");
	let playersNumberFilter = Engine.GetGUIObjectByName("playersNumberFilter");
	let mapTypeFilter = Engine.GetGUIObjectByName("mapTypeFilter");
	let gameRatingFilter = Engine.GetGUIObjectByName("gameRatingFilter");
	let filterOpenGames = Engine.GetGUIObjectByName("filterOpenGames");

	// We assume index 0 means display all for any given filter.
	if (mapSizeFilter.selected != 0 &&
	    game.mapSize != mapSizeFilter.list_data[mapSizeFilter.selected])
		return true;

	if (playersNumberFilter.selected != 0 &&
	    game.maxnbp != playersNumberFilter.list_data[playersNumberFilter.selected])
		return true;

	if (mapTypeFilter.selected != 0 &&
	    game.mapType != mapTypeFilter.list_data[mapTypeFilter.selected])
		return true;

	if (filterOpenGames.checked && (game.nbp >= game.maxnbp || game.state != "init"))
		return true;

	if (gameRatingFilter.selected > 0)
	{
		let selected = gameRatingFilter.list_data[gameRatingFilter.selected];
		if (selected.startsWith(">") && +selected.substr(1) >= game.gameRating ||
		    selected.startsWith("<") && +selected.substr(1) <= game.gameRating)
			return true;
	}

	return false;
}

function handleKick(banned, nick, reason, time, historic)
{
	let kickString = nick == g_Username ?
		banned ?
			translate("You have been banned from the lobby!") :
			translate("You have been kicked from the lobby!") :
		banned ?
			translate("%(nick)s has been banned from the lobby.") :
			translate("%(nick)s has been kicked from the lobby.");

	if (reason)
		reason = sprintf(translateWithContext("lobby kick", "Reason: %(reason)s"), {
			"reason": reason
		});

	if (nick != g_Username)
	{
		addChatMessage({
			"text": "/special " + sprintf(kickString, { "nick": nick }) + " " + reason,
			"time": time,
			"historic": historic,
			"isSpecial": true
		});
		return;
	}

	addChatMessage({
		"from": "system",
		"time": time,
		"text": kickString + " " + reason,
	});

	g_Kicked = true;

	Engine.DisconnectXmppClient();

	messageBox(
		400, 250,
		kickString + "\n" + reason,
		banned ? translate("BANNED") : translate("KICKED")
	);
}

/**
 * Update the subject GUI object.
 */
function updateSubject(newSubject)
{
	Engine.GetGUIObjectByName("subject").caption = newSubject;

	// If the subject is only whitespace, hide it and reposition the logo.
	let subjectBox = Engine.GetGUIObjectByName("subjectBox");
	subjectBox.hidden = !newSubject.trim();

	let logo = Engine.GetGUIObjectByName("logo");
	if (subjectBox.hidden)
		logo.size = "50%-110 50%-50 50%+110 50%+50";
	else
		logo.size = "50%-110 40 50%+110 140";
}

/**
 * Update the caption of the toggle buddy button.
 */
function updateToggleBuddy()
{
	let playerList = Engine.GetGUIObjectByName("playerList");
	let playerName = playerList.list[playerList.selected];

	let toggleBuddyButton = Engine.GetGUIObjectByName("toggleBuddyButton");
	toggleBuddyButton.caption = g_Buddies.indexOf(playerName) != -1 ? translate("Unmark as Buddy") : translate("Mark as Buddy");
	toggleBuddyButton.enabled = playerName && playerName != g_Username;
}

/**
 * Do a full update of the player listing, including ratings from cached C++ information.
 */
function updatePlayerList(autoScroll = false)
{
	let playersBox = Engine.GetGUIObjectByName("playerList");
	let highlightedBuddy = Engine.ConfigDB_GetValue("user", "lobby.highlightbuddies") == "true";

	let buddyStatusList = [];
	let playerList = [];
	let presenceList = [];
	let nickList = [];
	let ratingList = [];

	g_PlayerList = Engine.GetPlayerList().map(player => {
		player.isBuddy = g_Buddies.indexOf(player.name) != -1;
		return player;
	}).sort((a, b) => {
		let status = obj => Object.keys(g_PlayerStatuses).indexOf(obj.presence); // + obj.name.toLowerCase();

		for (let sort of g_PlayersSort)
		{
			let ret = cmpObjs(a, b, sort.name, {
					'buddy': obj => (obj.name == g_Username ? 3 : obj.isBuddy ? 2 : 1),
					'rating': obj => +obj.rating,
					'status': obj => status(obj),
					'name': obj => obj.name.toLowerCase()
				}, sort.order);

			if (ret)
				return ret																									;

			// Keep user player on same sort data priored.
			if (a.name == g_Username)
				return -sort.order;
			if (b.name == g_Username)
				return +sort.order;
		}
		return 0;
	});

	// Colorize list entries
	for (let player of g_PlayerList)
	{
		if (player.rating && player.name == g_Username)
			g_UserRating = player.rating;
		let rating = player.rating ? ("     " + player.rating).substr(-5) : "     -";

		let presence = g_PlayerStatuses[player.presence] ? player.presence : "unknown";
		if (presence == "unknown")
			warn("Unknown presence:" + player.presence);

		let statusStyle = highlightedBuddy && player.name == g_Username ? g_UserStyle :
			highlightedBuddy && player.isBuddy ? g_PlayerStatuses[presence].buddyStyle :
			g_PlayerStatuses[presence].style;

		buddyStatusList.push(player.name == g_Username ? setStringTags(g_UserSymbol, statusStyle) : player.isBuddy ? setStringTags(g_BuddySymbol, statusStyle) : "");
		playerList.push(colorPlayerName((player.role == "moderator" ? g_ModeratorPrefix : "") + player.name));
		presenceList.push(setStringTags(g_PlayerStatuses[presence].status, statusStyle));
		ratingList.push(setStringTags(rating, statusStyle));
		nickList.push(player.name);
	}

	playersBox.list_buddy = buddyStatusList;
	playersBox.list_name = playerList;
	playersBox.list_status = presenceList;
	playersBox.list_rating = ratingList;
	playersBox.list = nickList;

	playersBox.auto_scroll = autoScroll;
	playersBox.selected = playersBox.list.indexOf(g_SelectedPlayer);
	updatePlayerGamesNumber();
}

/**
* Toggle buddy state for a player in playerlist within the user config
*/
function toggleBuddy()
{
	let playerList = Engine.GetGUIObjectByName("playerList");
	let name = playerList.list[playerList.selected];

	if (!name || name == g_Username || name.indexOf(g_BuddyListDelimiter) != -1)
		return;

	let index = g_Buddies.indexOf(name);
	if (index != -1)
		g_Buddies.splice(index, 1);
	else
		g_Buddies.push(name);

	updateToggleBuddy();

	saveSettingAndWriteToUserConfig("lobby.buddies", g_Buddies.filter(nick => nick).join(g_BuddyListDelimiter) || g_BuddyListDelimiter);

	updatePlayerList(true);
	updateGameList(true);
}

/**
 * Select the game where the selected player is currently playing, observing or offline.
 * Selects in that order to account for players that occur in multiple games.
 */
function selectGameFromPlayername()
{
	if (!g_SelectedPlayer)
		return;

	let gameList = Engine.GetGUIObjectByName("gameList");
	let foundAsObserver = false;
	let selected = -1;

	for (let i = 0; i < g_GameList.length; ++i)
		for (let player of stringifiedTeamListToPlayerData(g_GameList[i].players))
		{
			if (g_SelectedPlayer != splitRatingFromNick(player.Name).nick)
				continue;

			gameList.auto_scroll = true;
			if (player.Team == "observer")
			{
				foundAsObserver = true;
				selected = i;
			}
			else if (!player.Offline)
			{
				selected = i;
				break;
			}
			else if (!foundAsObserver)
				selected = i;
		}
	gameList.selected = selected;
	clearGameSelectionTooltip(true);
}

function onPlayerListSelection()
{
	let playerList = Engine.GetGUIObjectByName("playerList");
	if (playerList.selected == playerList.list.indexOf(g_SelectedPlayer))
		return;

	if (!g_SelectedPlayer)
		g_CancelHotkey.splice(2, 0, setPlayerListBoxUnselected);

	g_SelectedPlayer = playerList.list[playerList.selected];

	lookupSelectedUserProfile("playerList");

	// Keep selected player in view when profile panel get expanded firstly.
	updatePlayerList(true);

	// if (!g_SelectedPlayer)
	// 	return;

	// lookupSelectedUserProfile("playersBox");
	updateToggleBuddy();
	selectGameFromPlayername();
	clearPlayerSelectionTooltip(true);
}

function setLeaderboardVisibility(visible)
{
	if (visible == !Engine.GetGUIObjectByName("leaderboard").hidden)
		return false;
	if (visible)
		Engine.SendGetBoardList();

	lookupSelectedUserProfile(visible ? "leaderboardBox" : "playerList");
	Engine.GetGUIObjectByName("leaderboard").hidden = !visible;
	Engine.GetGUIObjectByName("fade").hidden = !visible;
	return true;
}

function setUserProfileVisibility(visible)
{
	if (visible == !Engine.GetGUIObjectByName("profileFetch").hidden)
		return false;
	Engine.GetGUIObjectByName("profileFetch").hidden = !visible;
	Engine.GetGUIObjectByName("fade").hidden = !visible;
	return true;
}

/**
 * Display the profile of the player in the user profile window.
 */
function lookupUserProfile()
{
	Engine.SendGetProfile(Engine.GetGUIObjectByName("fetchInput").caption);
}

function setLeftPanelExpanded(expanded)
{
	Engine.GetGUIObjectByName("profilePanel").hidden = expanded;
	Engine.GetGUIObjectByName("leftPanel").size = "20 " +(g_Dialog ? "18" : "40") + " 20% 100%-105" + (expanded ? "" : "-205");
}

function setGameListBoxUnselected(cancelHotkeyFunctionIndex)
{
	if (Engine.GetGUIObjectByName("gameList").selected == -1)
		return false;
	Engine.GetGUIObjectByName("gameList").selected = -1;
	g_SelectedGameIP = "";
	g_SelectedGamePort = "";
	clearGameSelectionTooltip(false);

	g_CancelHotkey.splice(cancelHotkeyFunctionIndex, 1);
	return true;
}

function setPlayerListBoxUnselected(cancelHotkeyFunctionIndex)
{
	if (Engine.GetGUIObjectByName("playerList").selected == -1)
		return false;
	Engine.GetGUIObjectByName("playerList").selected = -1;
	g_SelectedPlayer = null;
	setLeftPanelExpanded(true);
	clearPlayerSelectionTooltip(false);

	g_CancelHotkey.splice(cancelHotkeyFunctionIndex, 1);
	return true;
}

/**
 * Display the profile of the selected player in the main window.
 * Displays N/A for all stats until updateProfile is called when the stats
 * are actually received from the bot.
 */
function lookupSelectedUserProfile(guiObjectName)
{
	let playerList = Engine.GetGUIObjectByName(guiObjectName);
	let playerName = playerList.list[playerList.selected];
	if (!playerName)
		return;

	setLeftPanelExpanded(false);

	Engine.SendGetProfile(playerName);

	Engine.GetGUIObjectByName("usernameText").caption = playerName;
	Engine.GetGUIObjectByName("rankText").caption = translate("N/A");
	Engine.GetGUIObjectByName("highestRatingText").caption = translate("N/A");
	Engine.GetGUIObjectByName("totalGamesText").caption = translate("N/A");
	Engine.GetGUIObjectByName("winsText").caption = translate("N/A");
	Engine.GetGUIObjectByName("lossesText").caption = translate("N/A");
	Engine.GetGUIObjectByName("ratioText").caption = translate("N/A");

	updateUserRoleText(playerName);
}

function updateUserRoleText(playerName)
{
	Engine.GetGUIObjectByName("roleText").caption = g_RoleNames[Engine.LobbyGetPlayerRole(playerName) || "participant"];
}

/**
 * Update the profile of the selected player with data from the bot.
 */
function updateProfile()
{
	let attributes = Engine.GetProfile()[0];

	let user = colorPlayerName(attributes.player, attributes.rating);

	if (!Engine.GetGUIObjectByName("profileFetch").hidden)
	{
		let profileFound = attributes.rating != "-2";
		Engine.GetGUIObjectByName("profileWindowArea").hidden = !profileFound;
		Engine.GetGUIObjectByName("profileErrorText").hidden = profileFound;

		if (!profileFound)
		{
			Engine.GetGUIObjectByName("profileErrorText").caption = sprintf(
				translate("Player \"%(nick)s\" not found."),
				{ "nick": attributes.player }
			);
			return;
		}

		Engine.GetGUIObjectByName("profileUsernameText").caption = user;
		Engine.GetGUIObjectByName("profileRankText").caption = attributes.rank;
		Engine.GetGUIObjectByName("profileHighestRatingText").caption = attributes.highestRating;
		Engine.GetGUIObjectByName("profileTotalGamesText").caption = attributes.totalGamesPlayed;
		Engine.GetGUIObjectByName("profileWinsText").caption = attributes.wins;
		Engine.GetGUIObjectByName("profileLossesText").caption = attributes.losses;
		Engine.GetGUIObjectByName("profileRatioText").caption = formatWinRate(attributes);
		return;
	}

	let playerList;
	if (!Engine.GetGUIObjectByName("leaderboard").hidden)
		playerList = Engine.GetGUIObjectByName("leaderboardBox");
	else
		playerList = Engine.GetGUIObjectByName("playerList");

	if (attributes.rating == "-2")
		return;

	// Make sure the stats we have received coincide with the selected player.
	if (attributes.player != playerList.list[playerList.selected])
		return;

	Engine.GetGUIObjectByName("usernameText").caption = user;
	Engine.GetGUIObjectByName("rankText").caption = attributes.rank;
	Engine.GetGUIObjectByName("highestRatingText").caption = attributes.highestRating;
	Engine.GetGUIObjectByName("totalGamesText").caption = attributes.totalGamesPlayed;
	Engine.GetGUIObjectByName("winsText").caption = attributes.wins;
	Engine.GetGUIObjectByName("lossesText").caption = attributes.losses;
	Engine.GetGUIObjectByName("ratioText").caption = formatWinRate(attributes);
}

/**
 * Update the leaderboard from data cached in C++.
 */
function updateLeaderboard()
{
	let leaderboard = Engine.GetGUIObjectByName("leaderboardBox");
	let boardList = Engine.GetBoardList().sort((a, b) => b.rating - a.rating);

	let list = [];
	let list_name = [];
	let list_rank = [];
	let list_rating = [];

	for (let i in boardList)
	{
		list_name.push(boardList[i].name);
		list_rating.push(boardList[i].rating);
		list_rank.push(+i + 1);
		list.push(boardList[i].name);
	}

	leaderboard.list_name = list_name;
	leaderboard.list_rating = list_rating;
	leaderboard.list_rank = list_rank;
	leaderboard.list = list;

	if (leaderboard.selected >= leaderboard.list.length)
		leaderboard.selected = -1;
}

function updatePlayerGamesNumber()
{
	let guiObj = Engine.GetGUIObjectByName("playerGamesNumber");
	let info = [];
	let tooltip = [];

	let formatInfo = (count, availableCount, name) => {
		if (count == 0)
			return "";
		let numbers = [ count ];
		if (availableCount > 0 )
			numbers.push('[color="0 255 0"]' + availableCount + '[/color]');
		return sprintf(translate("%(number)s %(info)s"), {
			"number": numbers.join(translateWithContext("value separator", "/")),
			"info": name
		});
	};

	info.push(formatInfo(
		g_PlayerList.length,
		g_PlayerList.filter(player => player.presence == "available").length,
		translatePlural("Player", "Players", g_PlayerList.length)
	));

	let buddyPlayerInfo = "";
	let buddiesList = g_PlayerList.filter(player => player.isBuddy);
	buddyPlayerInfo = formatInfo(
		buddiesList.length,
		buddiesList.filter(player => player.presence == "available").length,
		translatePlural("Buddy", "Buddies", buddiesList.length)
	);

	info.push(formatInfo(
		g_GameList.length,
		g_GameList.filter(game => game.state == "init").length,
		translatePlural("Game", "Games", g_GameList.length)
	));

	let buddyGamesInfo = "";
	let buddiesGamesList = g_GameList.filter(game => game.hasBuddies);
	buddyGamesInfo = formatInfo(
		buddiesGamesList.length,
		buddiesGamesList.filter(game => game.state == "init").length,
		translatePlural("Buddy Game", "Buddy Games", buddiesGamesList.length)
	);

	let caption = arr => arr.filter(str => str).join(translateWithContext("info separator", " · "));
	let removeFormationCode = string => string.replace(/\[.*?\]/g, "");

	for (let [ position, buddyInfo ] of [ [ 1, buddyPlayerInfo ], [ 3, buddyGamesInfo ] ])
	{
		if (buddyInfo == "")
			continue;
		if (Engine.GetTextWidth(guiObj.font, removeFormationCode(caption(info.concat(buddyInfo))) + "      ")
			<
			guiObj.getComputedSize().right - guiObj.getComputedSize().left)
			info.splice(position, 0, buddyInfo);
		else
			tooltip.push(buddyInfo);
	}

	guiObj.caption = caption(info);
	guiObj.tooltip = '[font="' + guiObj.font + '"]' + caption(tooltip) + '[/font]';
}

/**
 * Update the game listing from data cached in C++.
 */
function updateGameList(autoScroll = false)
{
	let gamesBox = Engine.GetGUIObjectByName("gameList");
	let highlightedBuddy = Engine.ConfigDB_GetValue("user", "lobby.highlightbuddies") == "true";
	let compTrans = (compTrans, obj, att, defAtt) => compTrans[att] && compTrans[att](obj) || obj[att] || obj[defAtt];

	if (gamesBox.selected > -1)
	{
		let game = g_GameList[gamesBox.selected];
		g_SelectedGameIP = game.stunIP ? game.stunIP : game.ip;
		g_SelectedGamePort = game.stunPort ? game.stunPort : game.port;
		// if (g_AutoScrollGameListFromSelection && g_GameList.length > 0)
		// 	warn(g_SelectedGameIP + ":" + g_SelectedGamePort);
	}

	g_GameList = Engine.GetGameList().map(game => {
		game.hasBuddies = 0;
		game.observeNum = 0;
		game.buddies = 0;

		// Compute average rating of participating players
		let playerRatings = [];

		for (let player of stringifiedTeamListToPlayerData(game.players))
		{
			let playerNickRating = splitRatingFromNick(player.Name);

			if (player.Team != "observer")
				playerRatings.push(playerNickRating.rating || g_DefaultLobbyRating);

			game.hasUser = game.hasUser || multiplayerName(g_Username) == playerNickRating.nick || playerNickRating.nick == g_Username;

			if (game.hasUser)
				game.hasBuddies = 3;
			// Sort games with playing buddies above games with spectating buddies
			if (game.hasBuddies < 2 && g_Buddies.indexOf(playerNickRating.nick) != -1)
				game.hasBuddies = player.Team == "observer" ? 1 : 2;

			if (!player.Offline && g_Buddies.indexOf(playerNickRating.nick) != -1)
			{
				++game.buddies;
			}

			if (player.Team == "observer")
				++game.observeNum;
		}

		game.time = 0;
		if (game.startTime)
			game.time = Math.round((Date.now() - game.startTime*1000)/(1000*60));

		game.gameRating =
			playerRatings.length ?
				Math.round(playerRatings.reduce((sum, current) => sum + current) / playerRatings.length) :
				g_DefaultLobbyRating;

		if (!!game.mods && !hasSameMods(JSON.parse(game.mods), g_EngineInfo.mods))
			game.state = "incompatible";

		return game;
	}).filter(game => !filterGame(game)).sort((a, b) => {
		for (let sort of g_GamesSort)
		{
			if (gamesBox["hidden_" + sort.name])
				continue;
				// (obj.hasBuddies || obj.hasUser == g_Username ? 1 : 2),
			let ret = cmpObjs(a, b, sort.name, {
				'buddy': obj => obj.buddies,
				'name': obj => g_GameStatusOrder.indexOf(obj.state) + obj.name.toLowerCase(),
				'mapName': obj => translate(obj.niceMapName),
				'nPlayers':	obj => obj.maxnbp
			}, sort.order);

			if (ret)
				return ret;
		}
		return 0;
	});

	let list_buddy = [];
	let list_buddies = [];
	let list_name = [];
	let list_mapName = [];
	let list_mapSize = [];
	let list_mapType = [];
	let list_nPlayers = [];
	let list_gameRating = [];
	let list_time = [];
	let list = [];
	let list_data = [];
	let selectedGameIndex = -1;

	for (let i in g_GameList)
	{
		let game = g_GameList[i];
		let gameName = escapeText(game.name);
		let mapTypeIdx = g_MapTypes.Name.indexOf(game.mapType);

		if ((g_SelectedGameName && game.name == g_SelectedGameName) || (game.stunIP && (game.stunIP == g_SelectedGameIP && game.stunPort == g_SelectedGamePort)) || (!game.stunIP && (game.ip == g_SelectedGameIP && game.port == g_SelectedGamePort)))
		{
			selectedGameIndex = +i;
			g_SelectedGameName = "";
		}

		list_buddy.push((game.hasBuddies || game.hasUser ? setStringTags(
			game.hasUser ? g_UserSymbol : g_BuddySymbol,
			highlightedBuddy && game.hasUser ? g_UserStyle :
			highlightedBuddy && game.hasBuddies ? g_GameColors[game.state].buddyStyle :
			g_GameColors[game.state].style)
			: "")+setStringTags(game.buddies ? " " + game.buddies : "", { "color": "255 215 0" }));

		let fgod = !!game.mods && JSON.parse(game.mods).some(mod => mod[0].startsWith("fgod"));
		list_name.push(setStringTags(gameName, fgod ? { "color": "yellow" } : highlightedBuddy && game.hasUser ? g_UserStyle :
			highlightedBuddy && game.hasBuddies ? g_GameColors[game.state].buddyStyle : g_GameColors[game.state].style));
		list_mapName.push(translateMapTitle(game.niceMapName));
		list_mapSize.push(translateMapSize(game.mapSize));
		list_mapType.push(g_MapTypes.Title[mapTypeIdx] || "");
		let ob = game.observeNum ? setStringTags(" +" + game.observeNum + "", { "color": "255 215 0" }) : "";

		list_nPlayers.push(game.nbp + "/" + game.maxnbp + ob);
		list_gameRating.push(game.gameRating);
		list.push(gameName);
		list_data.push(i);
		list_time.push(game.time + "m");
	}

	gamesBox.list_buddy = list_buddy;
	// gamesBox.list_buddies = list_buddies;
	gamesBox.list_name = list_name;
	gamesBox.list_mapName = list_mapName;
	gamesBox.list_mapSize = list_mapSize;
	gamesBox.list_mapType = list_mapType;
	gamesBox.list_nPlayers = list_nPlayers;
	gamesBox.list_gameRating = list_gameRating;
	gamesBox.list_time = list_time;

	// Change these last, otherwise crash
	gamesBox.list = list;
	gamesBox.list_data = list_data;

	gamesBox.auto_scroll = autoScroll;
	gamesBox.selected = selectedGameIndex;

	updateGameSelection();
	updatePlayerGamesNumber();
}

/**
 * Populate the game info area with information on the current game selection.
 */
function updateGameSelection()
{
	let game = selectedGame();

	Engine.GetGUIObjectByName("gameInfo").hidden = !game;
	Engine.GetGUIObjectByName("joinGameButton").hidden = g_Dialog || !game;
	Engine.GetGUIObjectByName("gameInfoEmpty").hidden = game;

	if (!game)
		return;

	Engine.GetGUIObjectByName("sgMapName").caption = translateMapTitle(game.niceMapName);

	let sgGameStartTime = Engine.GetGUIObjectByName("sgGameStartTime");
	let sgNbPlayers = Engine.GetGUIObjectByName("sgNbPlayers");
	let sgPlayersNames = Engine.GetGUIObjectByName("sgPlayersNames");

	let playersNamesSize = sgPlayersNames.size;
	playersNamesSize.top = game.startTime ? sgGameStartTime.size.bottom : sgNbPlayers.size.bottom;
	playersNamesSize.rtop = game.startTime ? sgGameStartTime.size.rbottom : sgNbPlayers.size.rbottom;
	sgPlayersNames.size = playersNamesSize;

	sgGameStartTime.hidden = !game.startTime;
	if (game.startTime)
		sgGameStartTime.caption = sprintf(
			// Translation: %(time)s is the hour and minute here.
			translate("Game started at %(time)s"), {
				"time": Engine.FormatMillisecondsIntoDateStringLocal(+game.startTime * 1000, translate("HH:mm"))
			});

	sgNbPlayers.caption = sprintf(
		translate("Players: %(current)s/%(total)s"), {
			"current": game.nbp,
			"total": game.maxnbp
		});

	sgPlayersNames.caption = formatPlayerInfo(stringifiedTeamListToPlayerData(game.players), null, game.hostUsername);
	Engine.GetGUIObjectByName("sgMapSize").caption = translateMapSize(game.mapSize);

	let mapTypeIdx = g_MapTypes.Name.indexOf(game.mapType);
	Engine.GetGUIObjectByName("sgMapType").caption = g_MapTypes.Title[mapTypeIdx] || "";

	let mapData = getMapDescriptionAndPreview(game.mapType, game.mapName);
	Engine.GetGUIObjectByName("sgMapDescription").caption = mapData.description;

	setMapPreviewImage("sgMapPreview", mapData.preview);
	clearGameSelectionTooltip(true);

	if (!g_SelectedGameIP)
		g_CancelHotkey.splice(2, 0, setGameListBoxUnselected)
	g_SelectedGameIP = "1";
}

function selectedGame()
{
	let gamesBox = Engine.GetGUIObjectByName("gameList");
	if (gamesBox.selected < 0)
		return undefined;

	return g_GameList[gamesBox.list_data[gamesBox.selected]];
}

/**
 * Immediately rejoin and join gamesetups. Otherwise confirm late-observer join attempt.
 */
function joinButton()
{
	let game = selectedGame();
	if (!game || (g_Dialog && !g_InGame))
		return;

	let rating = getRejoinRating(game);
	let username = rating ? multiplayerName(g_Username) + " (" + rating + ")" : multiplayerName(g_Username);

	if (game.state == "incompatible")
		messageBox(
			400, 200,
			translate("Your active mods do not match the mods of this game.") + "\n\n" +
				comparedModsString(JSON.parse(game.mods), g_EngineInfo.mods) + "\n\n" +
				translate("Do you want to switch to the mod selection page?"),
			translate("Incompatible mods"),
			[translate("No"), translate("Yes")],
			[
				null,
				() => {
					Engine.SwitchGuiPage("page_modmod.xml", {
						"cancelbutton": true
					});
				}
			]
		);
	else if (game.state == "init" || stringifiedTeamListToPlayerData(game.players).some(player => player.Name == username))
		joinSelectedGame();
	else
		messageBox(
			400, 200,
			translate("The game has already started. Do you want to join as observer?"),
			translate("Confirmation"),
			[translate("No"), translate("Yes")],
			[null, joinSelectedGame]
		);
}

function joinSelectedGame()
{
	if (g_InGame)
		messageBox(
			400, 200,
			translate("Do you want to quit the current game and join selected game?"),
			translate("Confirmation"),
			[translate("No"), translate("Yes")],
			[null, joinSelectedGameReally]
		);
	else
		joinSelectedGameReally();
}

/**
 * Attempt to join the selected game without asking for confirmation.
 */
function joinSelectedGameReally()
{
	let game = selectedGame();
	if (!game)
		return;

	let ip;
	let port;
	if (game.stunIP)
	{
		ip = game.stunIP;
		port = game.stunPort;
	}
	else
	{
		ip = game.ip;
		port = game.port;
	}

	if (ip.split('.').length != 4)
	{
		addChatMessage({
			"from": "system",
			"text": sprintf(
				translate("This game's address '%(ip)s' does not appear to be valid."),
				{ "ip": game.ip }
			)
		});
		return;
	}

	let nameToConnect = multiplayerName(g_Username);

	for (let player of stringifiedTeamListToPlayerData(game.players))
	{
		let playerNickRating = splitRatingFromNick(player.Name);
		if (playerNickRating.nick == nameToConnect && !player.Offline)
		{
			nameToConnect += "2";
			break;
		}
	}

	let settings = {
		"multiplayerGameType": "join",
		"ip": ip,
		"port": port,
		"name": nameToConnect,
		"rating": getRejoinRating(game),
		"useSTUN": !!game.stunIP,
		"hostJID": game.hostUsername + "@" + g_LobbyServer + "/0ad"
	};

	// if (g_InGame)
	// {
	// 	Engine.EndGame();
	// 	Engine.SwitchGuiPage("page_lobby.xml", { "joinGame": settings });
	// }
	// else
	if (g_Dialog)
		// Engine.SwitchGuiPage("page_lobby.xml", { "joinGame": settings });
		Engine.PopGuiPageCB({ "goGUI": [ "page_lobby.xml", { "joinGame": settings } ] });
	else
		Engine.PushGuiPage("page_gamesetup_mp.xml", settings);
}

/**
 * Rejoin games with the original playername, even if the rating changed meanwhile.
 */
function getRejoinRating(game)
{
	for (let player of stringifiedTeamListToPlayerData(game.players))
	{
		let playerNickRating = splitRatingFromNick(player.Name);
		if (playerNickRating.nick ==  multiplayerName(g_Username))
			return playerNickRating.rating;
	}
	return g_UserRating;
}

/**
 * Open the dialog box to enter the game name.
 */
function hostGame()
{
	Engine.PushGuiPage("page_gamesetup_mp.xml", {
		"multiplayerGameType": "host",
		"name": g_Username,
		"rating": g_UserRating
	});
}

/**
 * Processes GUI messages sent by the XmppClient.
 */
function onTick()
{
	updateTimers();

	let updateList = false;

	while (true)
	{
		let msg = Engine.LobbyGuiPollNewMessage();
		if (!msg)
			break;

		if (!g_NetMessageTypes[msg.type])
		{
			warn("Unrecognised message type: " + msg.type);
			continue;
		}
		if (!g_NetMessageTypes[msg.type][msg.level])
		{
			warn("Unrecognised message level: " + msg.level);
			continue;
		}

		if (g_NetMessageTypes[msg.type][msg.level](msg))
			updateList = true;
	}

	// To improve performance, only update the playerlist GUI when
	// the last update in the current stack is processed
	if (updateList)
		updatePlayerList();
}

/**
 * Executes a lobby command or sends GUI input directly as chat.
 */
function submitChatInput()
{
	let input = Engine.GetGUIObjectByName("chatInput");
	let text = input.caption;

	if (!text.length)
		return;

	if (handleChatCommand(text))
		Engine.LobbySendMessage(text);

	input.caption = "";
}

/**
 * Handle all '/' commands.
 *
 * @param {string} text - Text to be checked for commands.
 * @returns {boolean} true if the text should be sent via chat.
 */
function handleChatCommand(text)
{
	if (text[0] != '/')
		return true;

	let [cmd, args] = ircSplit(text);
	args = ircSplit("/" + args);

	if (!g_ChatCommands[cmd])
	{
		addChatMessage({
			"from": "system",
			"text": sprintf(
				translate("The command '%(cmd)s' is not supported."), {
					"cmd": coloredText(cmd, g_ChatCommandColor)
				})
		});
		return false;
	}

	if (g_ChatCommands[cmd].moderatorOnly && Engine.LobbyGetPlayerRole(g_Username) != "moderator")
	{
		addChatMessage({
			"from": "system",
			"text": sprintf(
				translate("The command '%(cmd)s' is restricted to moderators."), {
					"cmd": coloredText(cmd, g_ChatCommandColor)
				})
		});
		return false;
	}

	return g_ChatCommands[cmd].handler(args);
}

/**
 * Process and if appropriate, display a formatted message.
 *
 * @param {Object} msg - The message to be processed.
 */
function addChatMessage(msg)
{
	// if (!!msg.historic)
		// return;
	if (msg.from)
	{
		if (Engine.LobbyGetPlayerRole(msg.from) == "moderator")
			msg.from = g_ModeratorPrefix + msg.from;

		// Highlight local user's nick
		if (g_Username != msg.from)
		{
			msg.text = colorizeNameInText(msg.text, g_Username, getPlayerColor(g_Username));

			if (!msg.historic && msg.text.toLowerCase().search(matchPlayerName(g_Username.toLowerCase())) != -1)
				soundNotification("nick");
		}
	}

	let formatted = ircFormat(msg);
	if (!formatted)
		return;

	g_ChatMessages.push(formatted);
	Engine.GetGUIObjectByName("chatText").caption = g_ChatMessages.join("\n");
}

/**
 * Splits given input into command and argument.
 */
function ircSplit(string)
{
	let idx = string.indexOf(' ');

	if (idx != -1)
		return [string.substr(1, idx - 1), string.substr(idx + 1)];

	return [string.substr(1), ""];
}

/**
 * Format text in an IRC-like way.
 *
 * @param {Object} msg - Received chat message.
 * @returns {string} - Formatted text.
 */
function ircFormat(msg)
{
	let formattedMessage = "";
	let coloredFrom = msg.from && colorPlayerName(msg.from);

	// Handle commands allowed past handleChatCommand.
	if (msg.text[0] == '/')
	{
		let [command, message] = ircSplit(msg.text);
		switch (command)
		{
		case "me":
		{
			// Translation: IRC message prefix when the sender uses the /me command.
			let senderString = sprintf(translate("* %(sender)s"), {
				"sender": coloredFrom
			});

			// Translation: IRC message issued using the ‘/me’ command.
			formattedMessage = sprintf(translate("%(sender)s %(action)s"), {
				"sender": senderFont(senderString),
				"action": message
			});
			break;
		}
		case "say":
		{
			// Translation: IRC message prefix.
			let senderString = sprintf(translate("<%(sender)s>"), {
				"sender": coloredFrom
			});

			// Translation: IRC message.
			formattedMessage = sprintf(translate("%(sender)s %(message)s"), {
				"sender": senderFont(senderString),
				"message": message
			});
			break;
		}
		case "special":
		{
			if (msg.isSpecial)
				// Translation: IRC system message.
				formattedMessage = senderFont(sprintf(translate("== %(message)s"), {
					"message": message
				}));
			else
			{
				// Translation: IRC message prefix.
				let senderString = sprintf(translate("<%(sender)s>"), {
					"sender": coloredFrom
				});

				// Translation: IRC message.
				formattedMessage = sprintf(translate("%(sender)s %(message)s"), {
					"sender": senderFont(senderString),
					"message": message
				});
			}
			break;
		}
		default:
			return "";
		}
	}
	else
	{
		let senderString;

		// Translation: IRC message prefix.
		if (msg.private)
			senderString = sprintf(translateWithContext("lobby private message", "(%(private)s) <%(sender)s>"), {
				"private": coloredText(translate("Private"), g_PrivateMessageColor),
				"sender": coloredFrom
			});
		else
			senderString = sprintf(translate("<%(sender)s>"), {
				"sender": coloredFrom
			});

		// Translation: IRC message.
		formattedMessage = sprintf(translate("%(sender)s %(message)s"), {
			"sender": senderFont(senderString),
			"message": msg.text
		});
	}

	// Add chat message timestamp
	if (Engine.ConfigDB_GetValue("user", "chat.timestamp") != "true")
		return formattedMessage;

	// Translation: Time as shown in the multiplayer lobby (when you enable it in the options page).
	// For a list of symbols that you can use, see:
	// https://sites.google.com/site/icuprojectuserguide/formatparse/datetime?pli=1#TOC-Date-Field-Symbol-Table
	let timeString = Engine.FormatMillisecondsIntoDateStringLocal(msg.time ? msg.time * 1000 : Date.now(), translate("HH:mm"));

	// Translation: Time prefix as shown in the multiplayer lobby (when you enable it in the options page).
	let timePrefixString = sprintf(translate("\\[%(time)s]"), {
		"time": timeString
	});

	// Translation: IRC message format when there is a time prefix.
	return sprintf(translate("%(time)s %(message)s"), {
		"time": timePrefixString,
		"message": formattedMessage
	});
}

/**
 * Generate a (mostly) unique color for this player based on their name.
 * @see http://stackoverflow.com/questions/3426404/create-a-hexadecimal-colour-based-on-a-string-with-jquery-javascript
 * @param {string} playername
 */
function getPlayerColor(playername)
{
	if (playername == "system")
		return g_SystemColor;

	// Generate a probably-unique hash for the player name and use that to create a color.
	let hash = 0;
	for (let i in playername)
		hash = playername.charCodeAt(i) + ((hash << 5) - hash);

	// First create the color in RGB then HSL, clamp the lightness so it's not too dark to read, and then convert back to RGB to display.
	// The reason for this roundabout method is this algorithm can generate values from 0 to 255 for RGB but only 0 to 100 for HSL; this gives
	// us much more variety if we generate in RGB. Unfortunately, enforcing that RGB values are a certain lightness is very difficult, so
	// we convert to HSL to do the computation. Since our GUI code only displays RGB colors, we have to convert back.
	let [h, s, l] = rgbToHsl(hash >> 24 & 0xFF, hash >> 16 & 0xFF, hash >> 8 & 0xFF);
	return hslToRgb(h, s, Math.max(0.7, l)).join(" ");
}

/**
 * Returns the given playername wrapped in an appropriate color-tag.
 *
 * @param {string} playername
 * @param {string} rating
 */
function colorPlayerName(playername, rating)
{
	return coloredText(
		(rating ? sprintf(
			translate("%(nick)s (%(rating)s)"), {
				"nick": playername,
				"rating": rating
			}) : playername
		),
		getPlayerColor(playername.replace(g_ModeratorPrefix, "")));
}

function senderFont(text)
{
	return '[font="' + g_SenderFont + '"]' + text + "[/font]";
}

function formatWinRate(attr)
{
	if (!attr.totalGamesPlayed)
		return translateWithContext("Used for an undefined winning rate", "-");

	return sprintf(translate("%(percentage)s%%"), {
		"percentage": (attr.wins / attr.totalGamesPlayed * 100).toFixed(2)
	});
}

function showLastGameSummary()
{
	let replays = Engine.GetReplays(false).filter(replay =>
		replay.attribs.settings.PlayerData.filter(player => player && !player.AI).length > 1 ).sort((a, b) =>
			b.attribs.timestamp - a.attribs.timestamp
		);

	let simData = {};
	if (replays)
		for (let i in replays)
		{
			simData = Engine.GetReplayMetadata(replays[i].directory);
			if (simData)
				break;
		}

	if (!replays || !simData)
	{
		messageBox(500, 200, translate("No summary data available."), translate("Error"));
		return;
	}

	Engine.PushGuiPage("page_summary.xml", {
		"sim": simData,
		"gui": {
			"replayDirectory": replays[0].directory,
			"isInLobby": true,
			"ingame": g_InGame,
			"dialog": true },
		"callback": "startReplay"
	});
}


function storeCivInfoPage(data)
{
	g_CivInfo.code = data.civ;
	g_CivInfo.page = data.page;
}
