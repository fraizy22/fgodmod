var currentSubmenuType; // contains submenu type
var MARGIN = 4; // menu border size
var g_ShowSplashScreens;

/**
 * Available backdrops
 */
var g_BackgroundLayerData = [];

/**
 * Chosen backdrop
 */
var g_BackgroundLayerset;

var g_T0 = Date.now();
var g_LastTickTime = Date.now();
const g_EngineInfo = Engine.GetEngineInfo();
var oneNotFound = false;

function setDefaultUserConfs()
{
	let values = {

		"hotkey": { 
			close: "Shift+Escape",
			options: "Alt+O",
			focustextinput: "tab" },
		"gui": {
		startintolobby: "false"

		},"gui.lobby": {
		morebuttonsbar: "hiding"
			
		},"load": {
		gamessort: "date:-1,mapName:1,mapType:1,description:1"

			},"lobby": {
		highlightbuddies: "false",       
		autoawaytime: "5"               ,   
		presenceselection: "available_awaytime" ,
		secureauth: "false"

		},"lobby.statuscolors.games": {
		init: "0 219 0",
		waiting: "255 127 0",
		running: "219 0 0",
		incompatible: "128 128 128"

		},"lobby.statuscolors.games.buddy": {
		init: "80 219 219",
		waiting: "255 127 255",
		running: "230 80 230",
		incompatible: "160 160 160"

		},"lobby.statuscolors.players": {
		available: "0 219 0",
		away: "229 76 13",
		playing: "200 0 0",
		offline: "0 0 0",
		unknown: "178 178 178"

		},"lobby.statuscolors.players.buddy": {
		available: "102 226 255",
		away: "249 156 249",
		playing: "230 80 230",
		offline: "44 44 88",
		unknown: "89 89 178"
		},"lobby.userplayer": {
		color: "102 103 255"

		},"lobby.sort": {
		players: "buddy:-1,status:1,name:1,rating:-1",
		games: "buddy:-1,name:1,mapType:1,mapSize:1,gameRating:-1,mapName:1,nPlayers:-1"

		},"replay": {
		sort: "months:-1,players:1,mapName:1,mapSize:1,popCapacity:1,duration:1"
		}
	};
	
	Object.keys(values).forEach(key => {
		Object.keys(values[key]).forEach(key2 => {
			if (!Engine.ConfigDB_GetValue("user", key + "." + key2))
			{
				// warn("Setting default value for user config " + key + "." + key2 + " = " + uneval(values[key][key2]));
				saveSettingAndWriteToUserConfig(key + "." + key2, values[key][key2]);
				oneNotFound = true;
			}
		})
	});

}


function init(initData, hotloadData)
{
	initMusic();
	
	if (!Engine.GetEngineInfo() || !("engine_version" in Engine.GetEngineInfo()) || Engine.GetEngineInfo().engine_version != "0.0.23")
	{
		warn("Wrong 0 A.D. Version. Fgod mod only made for 0 A.D. version 0.0.23. You may experience inappropriate behaviour.");
	}

	setDefaultUserConfs();

	// If no default settings setted assume we can once set secureauth to false
	if (oneNotFound)
		saveSettingAndWriteToUserConfig("lobby.secureauth", "false");

	global.music.setState(global.music.states.MENU);

	// Initialize currentSubmenuType with placeholder to avoid null when switching
	currentSubmenuType = "submenuSinglePlayer";

	EnableUserReport(Engine.IsUserReportEnabled());

	// Only show splash screen(s) once at startup, but not again after hotloading
	g_ShowSplashScreens = hotloadData ? hotloadData.showSplashScreens : initData && initData.isStartup;

	// Pick a random background and initialise it
	g_BackgroundLayerset = pickRandom(g_BackgroundLayerData);
	for (let i = 0; i < g_BackgroundLayerset.length; ++i)
	{
		let guiObj = Engine.GetGUIObjectByName("background[" + i + "]");
		guiObj.hidden = false;
		guiObj.sprite = g_BackgroundLayerset[i].sprite;
		guiObj.z = i;
	}
	Engine.GetGUIObjectByName("structreeButton").tooltip = colorizeHotkey(
		translate("%(hotkey)s: View the structure tree of civilizations featured in 0 A.D."),
		"structree");
	Engine.GetGUIObjectByName("civInfoButton").tooltip = colorizeHotkey(
		translate("%(hotkey)s: Learn about the many civilizations featured in 0 A.D."),
		"civinfo");
	Engine.GetGUIObjectByName("lobbyButton").tooltip = colorizeHotkey(
		translate("%(hotkey)s: Launch the multiplayer lobby to join and host publicly visible games and chat with other players."),
		"lobby");
	Engine.GetGUIObjectByName("optionsButton").tooltip = colorizeHotkey(
		translate("%(hotkey)s: Adjust game settings."),
		"options");

	if (initData && initData.isStartup && Engine.ConfigDB_GetValue("user", "gui.startintolobby") === "true")
		Engine.PushGuiPage("page_prelobby.xml", { "connect" : true });
}

function getHotloadData()
{
	return { "showSplashScreens": g_ShowSplashScreens };
}

function scrollBackgrounds()
{
	for (let i = 0; i < g_BackgroundLayerset.length; ++i)
	{
		let guiObj = Engine.GetGUIObjectByName("background[" + i + "]");

		let screen = guiObj.parent.getComputedSize();
		let h = screen.bottom - screen.top;
		let w = h * 16/9;
		let iw = h * 2;

		let offset = g_BackgroundLayerset[i].offset((Date.now() - g_T0) / 1000, w);

		if (g_BackgroundLayerset[i].tiling)
		{
			let left = offset % iw;
			if (left >= 0)
				left -= iw;
			guiObj.size = new GUISize(left, screen.top, screen.right, screen.bottom);
		}
		else
			guiObj.size = new GUISize(screen.right/2 - h + offset, screen.top, screen.right/2 + h + offset, screen.bottom);
	}
}

function submitUserReportMessage()
{
	let input = Engine.GetGUIObjectByName("userReportMessageInput");
	if (input.caption.length)
		Engine.SubmitUserReport("message", 1, input.caption);
	input.caption = "";
}

function formatUserReportStatus(status)
{
	let d = status.split(/:/, 3);

	if (d[0] == "disabled")
		return translate("disabled");

	if (d[0] == "connecting")
		return translate("connecting to server");

	if (d[0] == "sending")
		return sprintf(translate("uploading (%f%%)"), Math.floor(100 * d[1]));

	if (d[0] == "completed")
	{
		let httpCode = d[1];
		if (httpCode == 200)
			return translate("upload succeeded");
		return sprintf(translate("upload failed (%(errorCode)s)"), { "errorCode": httpCode });
	}

	if (d[0] == "failed")
		return sprintf(translate("upload failed (%(errorMessage)s)"), { "errorMessage": d[2] });

	return translate("unknown");
}

function onTick()
{
	let now = Date.now();
	let tickLength = Date.now() - g_LastTickTime;
	g_LastTickTime = now;

	scrollBackgrounds();

	updateMenuPosition(tickLength);

	if (Engine.IsUserReportEnabled())
		Engine.GetGUIObjectByName("userReportEnabledText").caption =
			'[font="sans-bold-16"]' + translate("Thank you for helping improve 0 A.D.!") + "[/font]\n\n" +
			translate("Anonymous feedback is currently enabled.") + "\n" +
			sprintf(translate("Status: %(status)s."), {
				"status": formatUserReportStatus(Engine.GetUserReportStatus())
			});

	// Show splash screens here, so we don't interfere with main menu hotloading
	if (g_ShowSplashScreens)
	{
		g_ShowSplashScreens = false;

		if (Engine.ConfigDB_GetValue("user", "gui.splashscreen.enable") === "true" ||
		    Engine.ConfigDB_GetValue("user", "gui.splashscreen.version") < Engine.GetFileMTime("gui/splashscreen/splashscreen.txt"))
			Engine.PushGuiPage("page_splashscreen.xml", { "page": "splashscreen", "callback": "SplashScreenClosedCallback" });
		else
			ShowRenderPathMessage();
	}
}

function ShowRenderPathMessage()
{
	// Warn about removing fixed render path
	if (Engine.Renderer_GetRenderPath() == "fixed")
		messageBox(
			600, 300,
			"[font=\"sans-bold-16\"]" +
			sprintf(translate("%(warning)s You appear to be using non-shader (fixed function) graphics. This option will be removed in a future 0 A.D. release, to allow for more advanced graphics features. We advise upgrading your graphics card to a more recent, shader-compatible model."), {
				"warning": coloredText("Warning:", "200 20 20")
			}) +
			"\n\n" +
			// Translation: This is the second paragraph of a warning. The
			// warning explains that the user is using “non-shader“ graphics,
			// and that in the future this will not be supported by the game, so
			// the user will need a better graphics card.
			translate("Please press \"Read More\" for more information or \"OK\" to continue."),
			translate("WARNING!"),
			[translate("OK"), translate("Read More")],
			[ null, function() { Engine.OpenURL("http://www.wildfiregames.com/forum/index.php?showtopic=16734"); } ]
		);
}

function SplashScreenClosedCallback()
{
	ShowRenderPathMessage();
}

function EnableUserReport(Enabled)
{
	Engine.GetGUIObjectByName("userReportDisabled").hidden = Enabled;
	Engine.GetGUIObjectByName("userReportEnabled").hidden = !Enabled;
	Engine.SetUserReportEnabled(Enabled);
}

/**
 * Slide menu.
 */
function updateMenuPosition(dt)
{
	let submenu = Engine.GetGUIObjectByName("submenu");

	if (submenu.hidden == false)
	{
		// Number of pixels per millisecond to move
		let SPEED = 1.2;

		let maxOffset = Engine.GetGUIObjectByName("mainMenu").size.right - submenu.size.left;
		if (maxOffset > 0)
		{
			let offset = Math.min(SPEED * dt, maxOffset);
			let size = submenu.size;
			size.left += offset;
			size.right += offset;
			submenu.size = size;
		}
	}
}

/**
 * Opens the menu by revealing the screen which contains the menu.
 */
function openMenu(newSubmenu, position, buttonHeight, numButtons)
{
	currentSubmenuType = newSubmenu;
	Engine.GetGUIObjectByName(currentSubmenuType).hidden = false;

	let submenu = Engine.GetGUIObjectByName("submenu");
	let top = position - MARGIN;
	let bottom = position + ((buttonHeight + MARGIN) * numButtons);
	submenu.size = new GUISize(submenu.size.left, top, submenu.size.right, bottom);

	// Blend in right border of main menu into the left border of the submenu
	blendSubmenuIntoMain(top, bottom);

	submenu.hidden = false;
}

function closeMenu()
{
	Engine.GetGUIObjectByName(currentSubmenuType).hidden = true;

	let submenu = Engine.GetGUIObjectByName("submenu");
	submenu.hidden = true;
	submenu.size = Engine.GetGUIObjectByName("mainMenu").size;

	Engine.GetGUIObjectByName("MainMenuPanelRightBorderTop").size = "100%-2 0 100% 100%";
}

/**
 * Sizes right border on main menu panel to match the submenu.
 */
function blendSubmenuIntoMain(topPosition, bottomPosition)
{
	Engine.GetGUIObjectByName("MainMenuPanelRightBorderTop").size = "100%-2 0 100% " + (topPosition + MARGIN);
	Engine.GetGUIObjectByName("MainMenuPanelRightBorderBottom").size = "100%-2 " + (bottomPosition) + " 100% 100%";
}

function getBuildString()
{
	return sprintf(translate("Build: %(buildDate)s (%(revision)s)"), {
		"buildDate": Engine.GetBuildTimestamp(0),
		"revision": Engine.GetBuildTimestamp(2)
	});
}

function exitGamePressed()
{
	closeMenu();

	messageBox(
		400, 200,
		translate("Are you sure you want to quit 0 A.D.?"),
		translate("Confirmation"),
		[translate("No"), translate("Yes")],
		[null, Engine.Exit]
	);
}

function pressedScenarioEditorButton()
{
	closeMenu();

	if (Engine.AtlasIsAvailable())
		messageBox(
			400, 200,
			translate("Are you sure you want to quit 0 A.D. and open the Scenario Editor?"),
			translate("Confirmation"),
			[translate("No"), translate("Yes")],
			[null, Engine.RestartInAtlas]
		);
	else
		messageBox(
			400, 200,
			translate("The scenario editor is not available or failed to load. See the game logs for additional information."),
			translate("Error")
		);
}

function getLobbyDisabledByBuild()
{
	return translate("Launch the multiplayer lobby to join and host publicly visible games and chat with other players. \\[DISABLED BY BUILD]");
}

function getTechnicalDetails()
{
	return translate("Technical Details");
}

function getManual()
{
	return translate("Manual");
}
