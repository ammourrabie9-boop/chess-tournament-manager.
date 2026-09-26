document.addEventListener("DOMContentLoaded", () => {
const $ = id => document.getElementById(id);

const sections = {
    tournaments: $("myTournamentsSection"),
    create: $("createTournamentSection"),
    active: $("activeTournamentSection"),
    profile: $("profileSection")
};

const nav = {
    tournaments: $("sidebarMyTournaments"),
    create: $("sidebarCreateTournament"),
    profile: $("sidebarProfile")
};

let createPlayers = [];
let activeTournamentId = null;
let profileEditMode = false;

const STORAGE_KEY =
    "chessTournamentManager_tournaments_v4";

const SESSION_KEY =
    "chessTournamentManager_session";

const PROFILE_STORAGE_KEY =
    "chessTournamentManager_chess_profiles_v1";


/* ============================================================
   STORAGE
============================================================ */

function loadTournaments() {
    try {
        return JSON.parse(
            localStorage.getItem(STORAGE_KEY) || "[]"
        );
    } catch {
        return [];
    }
}

function saveTournaments(items) {
    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(items)
    );
}

function currentEmail() {
    /*
     * The Profile must always use the email of the account
     * that actually signed in. Some versions of the login
     * page store it in different places, so we check all
     * common locations before ever using local_guest.
     */
    const normalizeEmail = value => {
        if (typeof value !== "string") {
            return "";
        }

        const email = value.trim().toLowerCase();

        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
            ? email
            : "";
    };

    const readValue = value => {
        const email = normalizeEmail(value);
        return email || "";
    };

    const collectEmails = value => {
        const found = [];

        const walk = (item, depth = 0) => {
            if (depth > 5 || item == null) {
                return;
            }

            if (typeof item === "string") {
                const email = readValue(item);
                if (email) {
                    found.push(email);
                }
                return;
            }

            if (Array.isArray(item)) {
                item.forEach(child => walk(child, depth + 1));
                return;
            }

            if (typeof item === "object") {
                Object.entries(item).forEach(([key, child]) => {
                    const lowerKey = key.toLowerCase();

                    /* Prefer fields that are explicitly email/account fields. */
                    if (
                        lowerKey.includes("email") ||
                        lowerKey === "mail" ||
                        lowerKey === "login" ||
                        lowerKey === "username"
                    ) {
                        const email = readValue(child);
                        if (email) {
                            found.push(email);
                        }
                    }

                    walk(child, depth + 1);
                });
            }
        };

        walk(value);
        return found;
    };

    const candidates = [];

    const addCandidate = value => {
        const email = readValue(value);
        if (email) {
            candidates.push(email);
        }
    };

    try {
        /* Direct email keys used by the login page. */
        addCandidate(localStorage.getItem("userEmail"));
        addCandidate(localStorage.getItem("email"));
        addCandidate(localStorage.getItem("loggedInEmail"));
        addCandidate(localStorage.getItem("currentUserEmail"));
        addCandidate(localStorage.getItem("accountEmail"));

        /* Current session, including nested session structures. */
        const rawSession =
            localStorage.getItem(SESSION_KEY);

        if (rawSession) {
            try {
                const session = JSON.parse(rawSession);
                candidates.push(...collectEmails(session));
            } catch {
                addCandidate(rawSession);
            }
        }

        /* Also support login implementations using sessionStorage. */
        addCandidate(sessionStorage.getItem("userEmail"));
        addCandidate(sessionStorage.getItem("email"));
        addCandidate(sessionStorage.getItem("loggedInEmail"));
        addCandidate(sessionStorage.getItem("currentUserEmail"));
        addCandidate(sessionStorage.getItem("accountEmail"));

        const rawSessionStorage =
            sessionStorage.getItem(SESSION_KEY);

        if (rawSessionStorage) {
            try {
                candidates.push(
                    ...collectEmails(
                        JSON.parse(rawSessionStorage)
                    )
                );
            } catch {
                addCandidate(rawSessionStorage);
            }
        }

        /*
         * Last-resort search through storage keys. This is useful
         * when the login page uses a custom key such as
         * "currentAccount", "authUser", etc.
         */
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i) || "";
            const lowerKey = key.toLowerCase();

            if (
                lowerKey.includes("auth") ||
                lowerKey.includes("account") ||
                lowerKey.includes("user") ||
                lowerKey.includes("login") ||
                lowerKey.includes("session")
            ) {
                const raw = localStorage.getItem(key);

                try {
                    candidates.push(...collectEmails(JSON.parse(raw)));
                } catch {
                    addCandidate(raw);
                }
            }
        }

        /* Cookies can also be used by simple local login systems. */
        if (document.cookie) {
            document.cookie
                .split(";")
                .forEach(cookie => {
                    const value =
                        cookie.split("=").slice(1).join("=");
                    addCandidate(decodeURIComponent(value || ""));
                });
        }

        return candidates[0] || "local_guest";

    } catch (error) {
        console.error(
            "Unable to determine the logged-in email:",
            error
        );

        return candidates[0] || "local_guest";
    }
}
function loadChessProfiles() {
    try {
        return JSON.parse(
            localStorage.getItem(
                PROFILE_STORAGE_KEY
            ) || "{}"
        );
    } catch {
        return {};
    }
}

function saveChessProfiles(profiles) {
    try {
        localStorage.setItem(
            PROFILE_STORAGE_KEY,
            JSON.stringify(profiles)
        );

        return true;

    } catch (error) {
        console.error(
            "Unable to save chess profiles:",
            error
        );

        return false;
    }
}

function getChessProfile() {
    const email = currentEmail();
    const profiles = loadChessProfiles();

    /*
     * If an older version created the profile while no account
     * email was available, move that profile to the real account
     * email as soon as the login email becomes available.
     */
    if (
        email !== "local_guest" &&
        !profiles[email] &&
        profiles.local_guest
    ) {
        profiles[email] = {
            ...profiles.local_guest,
            email
        };

        delete profiles.local_guest;
        saveChessProfiles(profiles);
    }

    const stored =
        profiles[email] || {
            name: "",
            firstName: "",
            lastName: "",
            email:
                email === "local_guest"
                    ? ""
                    : email,
            chessId: "",
            photo: ""
        };

    /*
     * Keep compatibility with older profiles that only had
     * one "name" field. The first time the profile is opened,
     * split that existing name into first/last name without
     * deleting any of the old information.
     */
    let firstName =
        String(stored.firstName || "").trim();

    let lastName =
        String(stored.lastName || "").trim();

    const oldName =
        String(stored.name || "").trim();

    if (!firstName && oldName) {
        const parts = oldName.split(/\\s+/);

        firstName = parts.shift() || "";
        lastName =
            lastName ||
            parts.join(" ");
    }

    return {
        ...stored,
        firstName,
        lastName,
        name:
            oldName ||
            [firstName, lastName]
                .filter(Boolean)
                .join(" "),
        email:
            stored.email ||
            (email === "local_guest" ? "" : email),
        chessId: stored.chessId || "",
        photo: stored.photo || ""
    };
}

function saveChessProfile(profile) {
    const email = currentEmail();
    const profiles = loadChessProfiles();

    profiles[email] = {
        ...profile,
        /* Never allow Profile editing to change account email. */
        email:
            email !== "local_guest"
                ? email
                : ""
    };

    return saveChessProfiles(profiles);
}

function escapeHtml(value) {
    return String(value ?? "").replace(
        /[&<>"']/g,
        c =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#039;"
            })[c]
    );
}

function uid(prefix = "id") {
    return (
        prefix +
        "_" +
        Date.now().toString(36) +
        Math.random()
            .toString(36)
            .slice(2, 8)
    );
}


/* ============================================================
   NAVIGATION
============================================================ */

function showSection(name) {
    Object.values(sections).forEach(section => {
        if (section) {
            section.style.display = "none";
        }
    });

    Object.values(nav).forEach(button => {
        if (button) {
            button.classList.remove("active");
        }
    });

    if (!sections[name]) {
        return;
    }

    sections[name].style.display = "block";

    if (nav[name]) {
        nav[name].classList.add("active");
    }

    try {
        if (name === "tournaments") {
            renderTournamentList();
        }

        if (name === "profile") {
            renderProfile();
        }

        if (name === "create") {
            resetCreateForm();
        }
    } catch (error) {
        console.error(`Error while opening section "${name}":`, error);
    }
}

function bindNavigationButton(button, sectionName) {
    if (!button) {
        console.warn(
            `Navigation button for "${sectionName}" was not found.`
        );
        return;
    }

    button.addEventListener(
        "click",
        event => {
            event.preventDefault();
            showSection(sectionName);
        }
    );
}

bindNavigationButton(
    nav.tournaments,
    "tournaments"
);

bindNavigationButton(
    nav.create,
    "create"
);

bindNavigationButton(
    nav.profile,
    "profile"
);


/* ============================================================
   CREATE TOURNAMENT
============================================================ */

function updatePlayerCount() {
    $("playerCount").textContent =
        createPlayers.length;
}

function maxSwissRounds(count) {
    if (count < 2) {
        return 0;
    }

    return Math.max(
        1,
        Math.floor(count / 2)
    );
}

function updateRoundOptions() {
    const count =
        createPlayers.length;

    const select =
        $("numberOfRounds");

    const help =
        $("roundsHelpText");

    select.innerHTML = "";

    if (count < 2) {
        select.disabled = true;

        const option =
            document.createElement("option");

        option.value = "";
        option.textContent =
            "Add players first";

        select.appendChild(option);

        help.textContent =
            "Add at least 2 players to determine the rounds.";

        return;
    }

    select.disabled = false;

    const type =
        $("tournamentType").value;

    let maxRounds;

    if (type === "Swiss System") {
        maxRounds =
            Math.max(
                1,
                Math.floor(count / 2)
            );
    } else {
        maxRounds =
            Math.max(
                1,
                count - 1
            );
    }

    for (
        let i = 1;
        i <= maxRounds;
        i++
    ) {
        const option =
            document.createElement("option");

        option.value = String(i);
        option.textContent = String(i);

        select.appendChild(option);
    }

    select.value =
        String(maxRounds);

    if (type === "Swiss System") {
        help.textContent =
            `With ${count} players, the maximum is ${maxRounds} round${maxRounds === 1 ? "" : "s"} to avoid exceeding the pairing limit.`;
    } else {
        help.textContent =
            `With ${count} players, up to ${maxRounds} rounds are available for this tournament type.`;
    }
}

$("tournamentType").addEventListener(
    "change",
    updateRoundOptions
);

function renderCreatePlayers() {
    $("playersList").innerHTML =
        createPlayers.length
            ? createPlayers
                  .map(
                      (p, i) => `
                        <div class="player-row">

                            <div class="player-number">
                                ${i + 1}
                            </div>

                            <div class="player-information">

                                <strong>
                                    ${escapeHtml(p.name)}
                                </strong>

                                <span>
                                    Elo:
                                    ${escapeHtml(p.elo)}
                                </span>

                                ${
                                    p.chessId
                                        ? `<span>ID: ${escapeHtml(p.chessId)}</span>`
                                        : ""
                                }

                            </div>

                        </div>
                    `
                  )
                  .join("")
            : "";

    updatePlayerCount();
    updateRoundOptions();
}

$("playerElo").addEventListener(
    "input",
    e => {
        e.target.value =
            e.target.value
                .replace(/\D/g, "")
                .slice(0, 4);
    }
);

$("activePlayerElo").addEventListener(
    "input",
    e => {
        e.target.value =
            e.target.value
                .replace(/\D/g, "")
                .slice(0, 4);
    }
);

$("addPlayerButton").addEventListener(
    "click",
    () => {
        const name =
            $("playerName")
                .value
                .trim();

        const elo =
            $("playerElo")
                .value
                .trim();

        const id =
            $("playerId")
                .value
                .trim();

        if (!name) {
            return alert(
                "Please enter the player's name."
            );
        }

        if (!elo) {
            return alert(
                "Please enter the player's Elo."
            );
        }

        if (!/^\d{1,4}$/.test(elo)) {
            return alert(
                "Elo must contain no more than 4 digits."
            );
        }

        createPlayers.push({
            id: uid("player"),
            name,
            elo: Number(elo),
            chessId: id
        });

        $("playerName").value = "";
        $("playerElo").value = "";
        $("playerId").value = "";

        renderCreatePlayers();

        $("playerName").focus();
    }
);

$("tiebreakList").addEventListener(
    "change",
    e => {
        if (
            !e.target.matches(
                "input[type=checkbox]"
            )
        ) {
            return;
        }

        const checked =
            [
                ...$("tiebreakList")
                    .querySelectorAll(
                        "input:checked"
                    )
            ];

        if (checked.length > 5) {
            e.target.checked = false;

            return alert(
                "You can select a maximum of 5 tiebreak systems."
            );
        }

        $("tiebreakCount").textContent =
            `${checked.length} / 5`;
    }
);

function resetCreateForm() {
    createPlayers = [];

    $("tournamentName").value = "";
    $("tournamentType").value = "";

    $("numberOfRounds").innerHTML =
        '<option value="">Add players first</option>';

    $("numberOfRounds").disabled = true;

    $("roundsHelpText").textContent =
        "Add players to determine the available number of rounds.";

    $("playerName").value = "";
    $("playerElo").value = "";
    $("playerId").value = "";

    $("playersList").innerHTML = "";

    $("playerCount").textContent = "0";

    $("tiebreakList")
        .querySelectorAll("input")
        .forEach(x => {
            x.checked = false;
        });

    $("tiebreakCount").textContent =
        "0 / 5";
}

$("createTournamentConfirmButton")
    .addEventListener(
        "click",
        () => {
            const name =
                $("tournamentName")
                    .value
                    .trim();

            const type =
                $("tournamentType")
                    .value;

            const rounds =
                Number(
                    $("numberOfRounds")
                        .value
                );

            const tiebreaks =
                [
                    ...$("tiebreakList")
                        .querySelectorAll(
                            "input:checked"
                        )
                ].map(
                    x => x.value
                );

            if (!name) {
                return alert(
                    "Please enter a tournament name."
                );
            }

            if (!type) {
                return alert(
                    "Please select a tournament type."
                );
            }

            if (
                createPlayers.length < 2
            ) {
                return alert(
                    "Please add at least 2 players."
                );
            }

            const maxRounds =
                type === "Swiss System"
                    ? maxSwissRounds(
                          createPlayers.length
                      )
                    : Math.max(
                          1,
                          createPlayers.length - 1
                      );

            if (
                !rounds ||
                rounds < 1 ||
                rounds > maxRounds
            ) {
                return alert(
                    `Please select between 1 and ${maxRounds} rounds.`
                );
            }

            const tournament = {
                id: uid("tournament"),

                owner:
                    currentEmail(),

                name,

                type,

                players:
                    createPlayers.map(
                        p => ({
                            ...p,

                            score: 0,
                            wins: 0,
                            draws: 0,
                            losses: 0,

                            opponents: [],
                            results: [],

                            byes: []
                        })
                    ),

                playerCount:
                    createPlayers.length,

                totalRounds:
                    rounds,

                tiebreaks,

                rounds: [],

                currentRound: 0,

                createdAt:
                    new Date()
                        .toISOString()
            };

            const tournaments =
                loadTournaments();

            tournaments.push(
                tournament
            );

            saveTournaments(
                tournaments
            );

            activeTournamentId =
                tournament.id;

            renderActiveTournament();

            showSection("active");
        }
    );


/* ============================================================
   TOURNAMENT LIST + DELETE
============================================================ */

function renderTournamentList() {
    const mine =
        loadTournaments()
            .filter(
                t =>
                    t.owner ===
                    currentEmail()
            );

    const container =
        $("tournamentsList");

    if (!mine.length) {
        container.innerHTML =
            `<div class="empty-state">
                You have not created any tournaments yet.
            </div>`;

        return;
    }

    container.innerHTML =
        mine
            .sort(
                (a, b) =>
                    new Date(
                        b.createdAt
                    ) -
                    new Date(
                        a.createdAt
                    )
            )
            .map(
                t => `
                    <div class="tournament-card">

                        <h3>
                            ${escapeHtml(t.name)}
                        </h3>

                        <div class="tournament-meta">

                            <span class="badge">
                                ${escapeHtml(t.type)}
                            </span>

                            <span class="badge">
                                ${t.players.length} players
                            </span>

                            <span class="badge">
                                ${t.rounds.length}/${t.totalRounds} rounds
                            </span>

                        </div>

                        <div class="tournament-card-footer">

                            <small>
                                ${new Date(
                                    t.createdAt
                                ).toLocaleDateString()}
                            </small>

                            <div style="
                                display:flex;
                                gap:8px;
                                align-items:center;
                            ">

                                <button
                                    type="button"
                                    class="secondary-button"
                                    data-open="${escapeHtml(t.id)}"
                                >
                                    Manage
                                </button>

                                <button
                                    type="button"
                                    class="secondary-button"
                                    data-delete-tournament="${escapeHtml(t.id)}"
                                    style="
                                        border-color:#ff5555;
                                        color:#ff5555;
                                    "
                                >
                                    Delete
                                </button>

                            </div>

                        </div>

                    </div>
                `
            )
            .join("");

    container
        .querySelectorAll(
            "[data-open]"
        )
        .forEach(btn => {
            btn.addEventListener(
                "click",
                () => {
                    activeTournamentId =
                        btn.dataset.open;

                    renderActiveTournament();

                    showSection("active");
                }
            );
        });

    container
        .querySelectorAll(
            "[data-delete-tournament]"
        )
        .forEach(btn => {
            btn.addEventListener(
                "click",
                () => {
                    const id =
                        btn.dataset
                            .deleteTournament;

                    const tournament =
                        loadTournaments()
                            .find(
                                t =>
                                    t.id ===
                                    id
                            );

                    if (!tournament) {
                        return;
                    }

                    const confirmed =
                        confirm(
                            `Are you sure you want to delete "${tournament.name}"?\n\nThis action cannot be undone.`
                        );

                    if (!confirmed) {
                        return;
                    }

                    const remaining =
                        loadTournaments()
                            .filter(
                                t =>
                                    t.id !==
                                    id
                            );

                    saveTournaments(
                        remaining
                    );

                    if (
                        activeTournamentId ===
                        id
                    ) {
                        activeTournamentId =
                            null;
                    }

                    renderTournamentList();
                }
            );
        });
}

function getActiveTournament() {
    return loadTournaments().find(
        t =>
            t.id ===
            activeTournamentId
    );
}

function saveActiveTournament(
    tournament
) {
    const tournaments =
        loadTournaments();

    const index =
        tournaments.findIndex(
            t =>
                t.id ===
                tournament.id
        );

    if (index !== -1) {
        tournaments[index] =
            tournament;

        saveTournaments(
            tournaments
        );
    }
}

$("closeTournamentButton")
    .addEventListener(
        "click",
        () =>
            showSection(
                "tournaments"
            )
    );


/* ============================================================
   ACTIVE PLAYERS
============================================================ */

$("addActivePlayerButton")
    .addEventListener(
        "click",
        () => {
            const form =
                $("activePlayerForm");

            form.style.display =
                form.style.display ===
                "none"
                    ? "grid"
                    : "none";
        }
    );

$("saveActivePlayerButton")
    .addEventListener(
        "click",
        () => {
            const t =
                getActiveTournament();

            if (!t) {
                return;
            }

            const name =
                $("activePlayerName")
                    .value
                    .trim();

            const elo =
                $("activePlayerElo")
                    .value
                    .trim();

            const chessId =
                $("activePlayerId")
                    .value
                    .trim();

            if (!name) {
                return alert(
                    "Please enter the player's name."
                );
            }

            if (!elo) {
                return alert(
                    "Please enter the player's Elo."
                );
            }

            if (!/^\d{1,4}$/.test(elo)) {
                return alert(
                    "Elo must contain no more than 4 digits."
                );
            }

            t.players.push({
                id: uid("player"),

                name,

                elo: Number(elo),

                chessId,

                score: 0,

                wins: 0,

                draws: 0,

                losses: 0,

                opponents: [],

                results: [],

                byes: []
            });

            saveActiveTournament(t);

            $("activePlayerName").value = "";
            $("activePlayerElo").value = "";
            $("activePlayerId").value = "";

            $("activePlayerForm")
                .style.display = "none";

            renderActiveTournament();
        }
    );


/* ============================================================
   SWISS HELPERS
============================================================ */

function playerScore(player) {
    return Number(
        player?.score || 0
    );
}

function byeCount(player) {
    if (Array.isArray(player?.byes)) {
        return player.byes.length;
    }

    return Number(player?.byes || 0);
}

function normalizeByeStorage(player) {
    if (!player) {
        return;
    }

    if (!Array.isArray(player.byes)) {
        player.byes = [];
    }
}

function hasPlayed(
    playerA,
    playerB
) {
    const aOpponents =
        Array.isArray(
            playerA?.opponents
        )
            ? playerA.opponents
            : [];

    const bOpponents =
        Array.isArray(
            playerB?.opponents
        )
            ? playerB.opponents
            : [];

    return (
        aOpponents.includes(
            playerB.id
        ) ||
        bOpponents.includes(
            playerA.id
        )
    );
}

function sameGroupPairCost(
    a,
    b
) {
    const repeated =
        hasPlayed(a, b);

    const eloDifference =
        Math.abs(
            Number(a.elo || 0) -
            Number(b.elo || 0)
        );

    return (
        (repeated ? 1000000 : 0) +
        eloDifference
    );
}

function floatingPairCost(
    a,
    b
) {
    const scoreDifference =
        Math.abs(
            playerScore(a) -
            playerScore(b)
        );

    const repeated =
        hasPlayed(a, b);

    const eloDifference =
        Math.abs(
            Number(a.elo || 0) -
            Number(b.elo || 0)
        );

    return (
        scoreDifference * 1000000 +
        (repeated ? 100000 : 0) +
        eloDifference
    );
}

function findGroupMatching(players) {
    if (!players.length) {
        return {
            pairs: [],
            cost: 0
        };
    }

    if (players.length % 2 !== 0) {
        return null;
    }

    let best = null;
    let bestCost = Infinity;

    function search(
        remaining,
        pairs,
        cost
    ) {
        if (!remaining.length) {
            if (cost < bestCost) {
                bestCost = cost;

                best = {
                    pairs: [...pairs],
                    cost
                };
            }

            return;
        }

        if (cost >= bestCost) {
            return;
        }

        let firstIndex = 0;
        let fewest = Infinity;

        for (
            let i = 0;
            i < remaining.length;
            i++
        ) {
            let available = 0;

            for (
                let j = 0;
                j < remaining.length;
                j++
            ) {
                if (i === j) {
                    continue;
                }

                if (
                    !hasPlayed(
                        remaining[i],
                        remaining[j]
                    )
                ) {
                    available++;
                }
            }

            if (
                available < fewest
            ) {
                fewest = available;
                firstIndex = i;
            }
        }

        const first =
            remaining[firstIndex];

        const candidates =
            remaining
                .filter(
                    p =>
                        p.id !==
                        first.id
                )
                .sort(
                    (a, b) =>
                        sameGroupPairCost(
                            first,
                            a
                        ) -
                        sameGroupPairCost(
                            first,
                            b
                        )
                );

        for (
            const opponent of candidates
        ) {
            const pairCost =
                sameGroupPairCost(
                    first,
                    opponent
                );

            const nextCost =
                cost + pairCost;

            if (
                nextCost >=
                bestCost
            ) {
                continue;
            }

            pairs.push({
                id: uid("pair"),
                whiteId: first.id,
                blackId:
                    opponent.id,
                result: null
            });

            search(
                remaining.filter(
                    p =>
                        p.id !==
                            first.id &&
                        p.id !==
                            opponent.id
                ),
                pairs,
                nextCost
            );

            pairs.pop();
        }
    }

    search(
        [...players],
        [],
        0
    );

    return best;
}

function pairScoreGroups(
    players
) {
    const groups = new Map();

    players.forEach(player => {
        const score =
            playerScore(player);

        const key =
            score.toFixed(1);

        if (!groups.has(key)) {
            groups.set(key, []);
        }

        groups
            .get(key)
            .push(player);
    });

    const sortedScores =
        [...groups.keys()]
            .map(Number)
            .sort(
                (a, b) =>
                    b - a
            );

    const pairs = [];
    const floats = [];

    for (
        const score of sortedScores
    ) {
        const key =
            score.toFixed(1);

        const group =
            groups.get(key);

        if (!group.length) {
            continue;
        }

        if (
            group.length % 2 ===
            0
        ) {
            const result =
                findGroupMatching(
                    group
                );

            if (result) {
                pairs.push(
                    ...result.pairs
                );
            } else {
                const floatPlayer =
                    [...group]
                        .sort(
                            (a, b) =>
                                byeCount(a) -
                                    byeCount(b) ||
                                Number(
                                    a.elo || 0
                                ) -
                                    Number(
                                        b.elo || 0
                                    )
                        )[0];

                floats.push(
                    floatPlayer
                );

                const remaining =
                    group.filter(
                        p =>
                            p.id !==
                            floatPlayer.id
                    );

                const fallback =
                    findGroupMatching(
                        remaining
                    );

                if (fallback) {
                    pairs.push(
                        ...fallback.pairs
                    );
                }
            }

            continue;
        }

        let bestFloat = null;
        let bestPairing = null;
        let bestCost = Infinity;

        for (
            const candidate of group
        ) {
            const remaining =
                group.filter(
                    p =>
                        p.id !==
                        candidate.id
                );

            const result =
                findGroupMatching(
                    remaining
                );

            if (!result) {
                continue;
            }

            const floatCost =
                Number(
                    candidate.elo || 0
                );

            if (
                result.cost +
                    floatCost <
                bestCost
            ) {
                bestCost =
                    result.cost +
                    floatCost;

                bestFloat =
                    candidate;

                bestPairing =
                    result;
            }
        }

        if (bestFloat) {
            pairs.push(
                ...bestPairing.pairs
            );

            floats.push(
                bestFloat
            );
        }
    }

    return {
        pairs,
        floats
    };
}

function pairFloats(
    floats
) {
    if (!floats.length) {
        return {
            pairs: [],
            remaining: []
        };
    }

    if (floats.length % 2 !== 0) {
        return {
            pairs: [],
            remaining: [...floats]
        };
    }

    const players =
        [...floats].sort(
            (a, b) =>
                playerScore(b) -
                playerScore(a)
        );

    let best = null;
    let bestCost = Infinity;

    function search(
        remaining,
        pairs,
        cost
    ) {
        if (!remaining.length) {
            if (cost < bestCost) {
                bestCost = cost;

                best = {
                    pairs: [...pairs],
                    cost
                };
            }

            return;
        }

        if (cost >= bestCost) {
            return;
        }

        const first =
            remaining[0];

        const candidates =
            remaining
                .slice(1)
                .sort(
                    (a, b) =>
                        floatingPairCost(
                            first,
                            a
                        ) -
                        floatingPairCost(
                            first,
                            b
                        )
                );

        for (
            const opponent of candidates
        ) {
            const pairCost =
                floatingPairCost(
                    first,
                    opponent
                );

            pairs.push({
                id: uid("pair"),
                whiteId: first.id,
                blackId:
                    opponent.id,
                result: null
            });

            search(
                remaining.filter(
                    p =>
                        p.id !==
                            first.id &&
                        p.id !==
                            opponent.id
                ),
                pairs,
                cost + pairCost
            );

            pairs.pop();
        }
    }

    search(
        players,
        [],
        0
    );

    return best
        ? {
              pairs: best.pairs,
              remaining: []
          }
        : {
              pairs: [],
              remaining: players
          };
}

function selectSwissBye(
    players
) {
    if (!players.length) {
        return null;
    }

    const minimumByes =
        Math.min(
            ...players.map(
                byeCount
            )
        );

    const candidates =
        players
            .filter(
                p =>
                    byeCount(p) ===
                    minimumByes
            )
            .sort(
                (a, b) =>
                    playerScore(a) -
                        playerScore(b) ||
                    Number(
                        a.elo || 0
                    ) -
                        Number(
                            b.elo || 0
                        )
            );

    let best = null;

    for (
        const candidate of candidates
    ) {
        const remaining =
            players.filter(
                p =>
                    p.id !==
                    candidate.id
            );

        const grouped =
            pairScoreGroups(
                remaining
            );

        const floated =
            pairFloats(
                grouped.floats
            );

        if (
            floated.remaining.length
        ) {
            continue;
        }

        const cost =
            grouped.pairs.length +
            floated.pairs.length;

        if (
            !best ||
            cost < best.cost
        ) {
            best = {
                bye: candidate,
                pairs: [
                    ...grouped.pairs,
                    ...floated.pairs
                ],
                cost
            };
        }
    }

    if (best) {
        return best;
    }

    return {
        bye: candidates[0],
        pairs: [],
        cost: Infinity
    };
}


/* ============================================================
   GENERAL SWISS BACKTRACKING
============================================================ */

function findGeneralSwissMatching(
    players
) {
    if (!players.length) {
        return {
            pairs: []
        };
    }

    if (players.length % 2 !== 0) {
        return null;
    }

    let best = null;
    let bestCost = Infinity;

    function search(
        remaining,
        pairs,
        cost
    ) {
        if (!remaining.length) {
            if (cost < bestCost) {
                bestCost = cost;

                best = {
                    pairs: [...pairs],
                    cost
                };
            }

            return;
        }

        if (cost >= bestCost) {
            return;
        }

        let firstIndex = 0;
        let fewest = Infinity;

        for (
            let i = 0;
            i < remaining.length;
            i++
        ) {
            let count = 0;

            for (
                let j = 0;
                j < remaining.length;
                j++
            ) {
                if (
                    i !== j &&
                    !hasPlayed(
                        remaining[i],
                        remaining[j]
                    )
                ) {
                    count++;
                }
            }

            if (count < fewest) {
                fewest = count;
                firstIndex = i;
            }
        }

        const first =
            remaining[firstIndex];

        const candidates =
            remaining
                .filter(
                    p =>
                        p.id !==
                        first.id
                )
                .sort(
                    (a, b) =>
                        floatingPairCost(
                            first,
                            a
                        ) -
                        floatingPairCost(
                            first,
                            b
                        )
                );

        for (
            const opponent of candidates
        ) {
            const pairCost =
                floatingPairCost(
                    first,
                    opponent
                );

            pairs.push({
                id: uid("pair"),
                whiteId: first.id,
                blackId:
                    opponent.id,
                result: null
            });

            search(
                remaining.filter(
                    p =>
                        p.id !==
                            first.id &&
                        p.id !==
                            opponent.id
                ),
                pairs,
                cost + pairCost
            );

            pairs.pop();
        }
    }

    search(
        [...players],
        [],
        0
    );

    return best;
}


/* ============================================================
   SWISS GENERATION
============================================================ */

function generateSwissPairings(
    tournament
) {
    const players =
        Array.isArray(
            tournament.players
        )
            ? [...tournament.players]
            : [];

    if (players.length < 2) {
        return {
            pairs: [],
            bye: null
        };
    }

    players.forEach(player => {
        if (
            !Array.isArray(
                player.byes
            )
        ) {
            player.byes = [];
        }

        if (
            !Array.isArray(
                player.opponents
            )
        ) {
            player.opponents = [];
        }

        if (
            !Array.isArray(
                player.results
            )
        ) {
            player.results = [];
        }

        if (
            typeof player.score !==
            "number"
        ) {
            player.score = 0;
        }

        if (
            typeof player.wins !==
            "number"
        ) {
            player.wins = 0;
        }

        if (
            typeof player.draws !==
            "number"
        ) {
            player.draws = 0;
        }

        if (
            typeof player.losses !==
            "number"
        ) {
            player.losses = 0;
        }
    });

    if (
        tournament.rounds.length === 0
    ) {
        let ordered =
            [...players].sort(
                (a, b) =>
                    Number(
                        b.elo || 0
                    ) -
                    Number(
                        a.elo || 0
                    )
            );

        let bye = null;

        if (
            ordered.length % 2 !== 0
        ) {
            bye =
                [...ordered].sort(
                    (a, b) =>
                        Number(
                            a.elo || 0
                        ) -
                        Number(
                            b.elo || 0
                        )
                )[0];

            ordered =
                ordered.filter(
                    p =>
                        p.id !==
                        bye.id
                );
        }

        const pairs = [];

        for (
            let i = 0;
            i < ordered.length;
            i += 2
        ) {
            if (
                !ordered[i + 1]
            ) {
                break;
            }

            pairs.push({
                id: uid("pair"),
                whiteId:
                    ordered[i].id,
                blackId:
                    ordered[i + 1].id,
                result: null
            });
        }

        return {
            pairs,
            bye
        };
    }

    let workingPlayers =
        [...players];

    let bye = null;

    if (
        workingPlayers.length % 2 !==
        0
    ) {
        const byeSelection =
            selectSwissBye(
                workingPlayers
            );

        if (
            byeSelection &&
            byeSelection.bye
        ) {
            bye =
                byeSelection.bye;

            workingPlayers =
                workingPlayers.filter(
                    p =>
                        p.id !==
                        bye.id
                );

            if (
                byeSelection.pairs &&
                byeSelection.pairs.length ===
                    workingPlayers.length / 2
            ) {
                return {
                    pairs:
                        byeSelection.pairs,
                    bye
                };
            }
        }
    }

    const grouped =
        pairScoreGroups(
            workingPlayers
        );

    const floatPairing =
        pairFloats(
            grouped.floats
        );

    let pairs = [
        ...grouped.pairs,
        ...floatPairing.pairs
    ];

    if (
        floatPairing.remaining.length
    ) {
        const remaining =
            floatPairing.remaining;

        const fallback =
            findGeneralSwissMatching(
                remaining
            );

        if (fallback) {
            pairs.push(
                ...fallback.pairs
            );
        }
    }

    if (
        pairs.length !==
        workingPlayers.length / 2
    ) {
        const fallback =
            findGeneralSwissMatching(
                workingPlayers
            );

        if (fallback) {
            pairs =
                fallback.pairs;
        }
    }

    return {
        pairs,
        bye
    };
}


/* ============================================================
   GENERIC TOURNAMENT PAIRING
============================================================ */

function shuffle(array) {
    const a = [...array];

    for (
        let i = a.length - 1;
        i > 0;
        i--
    ) {
        const j =
            Math.floor(
                Math.random() *
                    (i + 1)
            );

        [
            a[i],
            a[j]
        ] = [
            a[j],
            a[i]
        ];
    }

    return a;
}

function generateGenericPairings(
    tournament
) {
    const players =
        shuffle(
            tournament.players
        );

    const pairs = [];

    let bye = null;

    if (
        players.length % 2
    ) {
        bye =
            players.pop();
    }

    for (
        let i = 0;
        i < players.length;
        i += 2
    ) {
        pairs.push({
            id: uid("pair"),
            whiteId:
                players[i].id,
            blackId:
                players[i + 1].id,
            result: null
        });
    }

    return {
        pairs,
        bye
    };
}

function playerById(
    t,
    id
) {
    return t.players.find(
        p =>
            p.id === id
    );
}


/* ============================================================
   ACTIVE TOURNAMENT
============================================================ */

function renderActiveTournament() {
    const t =
        getActiveTournament();

    if (!t) {
        return;
    }

    if (t.completed) {
        renderCompletedTournament(t);
        return;
    }

    t.players.forEach(player => {
        if (
            !Array.isArray(
                player.byes
            )
        ) {
            player.byes = [];
        }

        if (
            !Array.isArray(
                player.opponents
            )
        ) {
            player.opponents = [];
        }

        if (
            !Array.isArray(
                player.results
            )
        ) {
            player.results = [];
        }

        if (
            typeof player.score !==
            "number"
        ) {
            player.score = 0;
        }

        if (
            typeof player.wins !==
            "number"
        ) {
            player.wins = 0;
        }

        if (
            typeof player.draws !==
            "number"
        ) {
            player.draws = 0;
        }

        if (
            typeof player.losses !==
            "number"
        ) {
            player.losses = 0;
        }
    });

    saveActiveTournament(t);

    $("activeTournamentTitle")
        .textContent =
        t.name;

    $("activeTournamentType")
        .textContent =
        t.type;

    $("activeType")
        .textContent =
        t.type;

    $("activePlayers")
        .textContent =
        t.players.length;

    $("activeRounds")
        .textContent =
        `${t.rounds.length}/${t.totalRounds}`;

    $("activeTiebreaks")
        .textContent =
        t.tiebreaks.length;

    $("activePlayersList")
        .innerHTML =
        t.players
            .map(
                (p, i) => `
                    <div class="player-row">

                        <div class="player-number">
                            ${i + 1}
                        </div>

                        <div class="player-information">

                            <strong>
                                ${escapeHtml(p.name)}
                            </strong>

                            <span>
                                Elo:
                                ${escapeHtml(p.elo)}
                            </span>

                            ${
                                p.chessId
                                    ? `<span>ID: ${escapeHtml(p.chessId)}</span>`
                                    : ""
                            }

                        </div>

                        <button
                            class="secondary-button"
                            data-remove-player="${escapeHtml(p.id)}"
                        >
                            Remove
                        </button>

                    </div>
                `
            )
            .join("");

    $("activePlayersList")
        .querySelectorAll(
            "[data-remove-player]"
        )
        .forEach(btn => {
            btn.addEventListener(
                "click",
                () => {
                    if (
                        t.rounds.length
                    ) {
                        return alert(
                            "Players cannot be removed after rounds have started."
                        );
                    }

                    if (
                        t.players.length <= 2
                    ) {
                        return alert(
                            "A tournament needs at least 2 players."
                        );
                    }

                    t.players =
                        t.players.filter(
                            p =>
                                p.id !==
                                btn.dataset
                                    .removePlayer
                        );

                    t.playerCount =
                        t.players.length;

                    saveActiveTournament(t);

                    renderActiveTournament();
                }
            );
        });

    const nextRound =
        t.rounds.length + 1;

    const finalRound =
        t.rounds[t.rounds.length - 1];

    const readyToComplete =
        nextRound > t.totalRounds &&
        Boolean(finalRound) &&
        roundComplete(finalRound);

    $("generateRoundButton")
        .textContent =
        nextRound > t.totalRounds
            ? "Complete Tournament"
            : `Generate Round ${nextRound}`;

    $("generateRoundButton")
        .disabled =
        nextRound > t.totalRounds
            ? !readyToComplete
            : false;

    renderCurrentRound(t);

    renderStandings(t);
}

function renderCurrentRound(t) {
    const container =
        $("roundsContainer");

    if (!t.rounds.length) {
        container.innerHTML =
            `<div class="empty-state">
                No round generated yet.
            </div>`;

        return;
    }

    const round =
        t.rounds[
            t.rounds.length - 1
        ];

    container.innerHTML = `
        <div class="round-card">

            <div class="round-card-header">

                <div>

                    <h3>
                        Round ${round.number}
                    </h3>

                    <span class="round-status">
                        ${
                            round.completed
                                ? "Completed"
                                : "In Progress"
                        }
                    </span>

                </div>

            </div>

            <div class="round-pairings">

                ${
                    round.bye
                        ? `
                            <div class="bye-row">
                                Bye:
                                <strong>
                                    ${escapeHtml(
                                        round.bye.name
                                    )}
                                </strong>
                                — 1 point
                            </div>
                        `
                        : ""
                }

                ${
                    round.pairs
                        .map(
                            pair =>
                                renderPairing(
                                    t,
                                    round,
                                    pair
                                )
                        )
                        .join("")
                }

            </div>

        </div>
    `;

    container
        .querySelectorAll(
            "[data-result]"
        )
        .forEach(btn => {
            btn.addEventListener(
                "click",
                () => {
                    if (
                        round.completed
                    ) {
                        return;
                    }

                    const pair =
                        round.pairs.find(
                            p =>
                                p.id ===
                                btn.dataset
                                    .result
                        );

                    if (!pair) {
                        return;
                    }

                    const value =
                        btn.dataset
                            .value;

                    pair.result =
                        pair.result ===
                        value
                            ? null
                            : value;

                    saveActiveTournament(t);

                    renderCurrentRound(t);

                    renderStandings(t);
                }
            );
        });

    container
        .querySelectorAll(
            "[data-clear-result]"
        )
        .forEach(btn => {
            btn.addEventListener(
                "click",
                () => {
                    const pair =
                        round.pairs.find(
                            p =>
                                p.id ===
                                btn.dataset
                                    .clearResult
                        );

                    if (
                        !pair ||
                        round.completed
                    ) {
                        return;
                    }

                    pair.result = null;

                    saveActiveTournament(t);

                    renderCurrentRound(t);

                    renderStandings(t);
                }
            );
        });
}

function renderPairing(
    t,
    round,
    pair
) {
    const white =
        playerById(
            t,
            pair.whiteId
        );

    const black =
        playerById(
            t,
            pair.blackId
        );

    return `
        <div class="pairing-row">

            <div class="pairing-player">

                <strong>
                    ${escapeHtml(
                        white?.name ||
                        "Unknown"
                    )}
                </strong>

                <span class="pairing-elo">
                    Elo:
                    ${escapeHtml(
                        white?.elo ?? "—"
                    )}
                </span>

            </div>

            <div class="pairing-result-controls">

                <button
                    class="result-button ${
                        pair.result ===
                        "1-0"
                            ? "active"
                            : ""
                    }"
                    data-result="${pair.id}"
                    data-value="1-0"
                    title="Left player wins"
                >
                    1–0
                </button>

                <button
                    class="result-button ${
                        pair.result ===
                        "0.5-0.5"
                            ? "active"
                            : ""
                    }"
                    data-result="${pair.id}"
                    data-value="0.5-0.5"
                    title="Draw"
                >
                    ½–½
                </button>

                <button
                    class="result-button ${
                        pair.result ===
                        "0-1"
                            ? "active"
                            : ""
                    }"
                    data-result="${pair.id}"
                    data-value="0-1"
                    title="Right player wins"
                >
                    0–1
                </button>

                <button
                    class="result-button result-clear"
                    data-clear-result="${pair.id}"
                    title="Clear result"
                >
                    ×
                </button>

            </div>

            <div class="pairing-player black">

                <span class="pairing-elo">
                    Elo:
                    ${escapeHtml(
                        black?.elo ?? "—"
                    )}
                </span>

                <strong>
                    ${escapeHtml(
                        black?.name ||
                        "Unknown"
                    )}
                </strong>

            </div>

        </div>
    `;
}


/* ============================================================
   RESULTS / STANDINGS
============================================================ */

function roundComplete(round) {
    return round.pairs.every(
        p => p.result
    );
}

function applyRoundToStandings(
    t,
    round
) {
    for (
        const pair of round.pairs
    ) {
        if (!pair.result) {
            continue;
        }

        const white =
            playerById(
                t,
                pair.whiteId
            );

        const black =
            playerById(
                t,
                pair.blackId
            );

        if (
            !white ||
            !black
        ) {
            continue;
        }

        white.opponents =
            white.opponents || [];

        black.opponents =
            black.opponents || [];

        if (
            !white.opponents.includes(
                black.id
            )
        ) {
            white.opponents.push(
                black.id
            );
        }

        if (
            !black.opponents.includes(
                white.id
            )
        ) {
            black.opponents.push(
                white.id
            );
        }

        white.results =
            white.results || [];

        black.results =
            black.results || [];

        if (
            pair.result ===
            "1-0"
        ) {
            white.score += 1;
            white.wins += 1;
            white.results.push(1);

            black.losses += 1;
            black.results.push(0);

        } else if (
            pair.result ===
            "0-1"
        ) {
            white.losses += 1;
            white.results.push(0);

            black.score += 1;
            black.wins += 1;
            black.results.push(1);

        } else {
            white.score += 0.5;
            white.draws += 1;
            white.results.push(0.5);

            black.score += 0.5;
            black.draws += 1;
            black.results.push(0.5);
        }
    }

    if (round.bye) {
        const byePlayer =
            playerById(
                t,
                round.bye.id
            );

        if (byePlayer) {
            byePlayer.score += 1;

            byePlayer.results =
                byePlayer.results || [];

            byePlayer.byes =
                byePlayer.byes || [];

            if (
                !Array.isArray(
                    byePlayer.byes
                )
            ) {
                byePlayer.byes = [];
            }

            if (
                !byePlayer.byes.includes(
                    round.number
                )
            ) {
                byePlayer.results.push(1);

                byePlayer.byes.push(
                    round.number
                );
            }
        }
    }

    round.completed = true;
}

$("generateRoundButton")
    .addEventListener(
        "click",
        () => {
            const t =
                getActiveTournament();

            if (!t || t.completed) {
                return;
            }

            const next =
                t.rounds.length + 1;

            /*
             * Final round: apply its results and lock
             * the tournament instead of generating
             * another round.
             */
            if (next > t.totalRounds) {
                const finalRound =
                    t.rounds[t.rounds.length - 1];

                if (!finalRound) {
                    return alert(
                        "Generate the first round before completing the tournament."
                    );
                }

                if (!roundComplete(finalRound)) {
                    return alert(
                        "Complete all results in the final round first."
                    );
                }

                if (!finalRound.applied) {
                    applyRoundToStandings(
                        t,
                        finalRound
                    );

                    finalRound.applied = true;
                }

                t.completed = true;
                t.completedAt =
                    new Date().toISOString();

                saveActiveTournament(t);

                renderCompletedTournament(t);
                return;
            }

            if (t.rounds.length) {
                const previous =
                    t.rounds[
                        t.rounds.length - 1
                    ];

                if (!roundComplete(previous)) {
                    return alert(
                        "Complete all results in the current round first."
                    );
                }

                if (!previous.applied) {
                    applyRoundToStandings(
                        t,
                        previous
                    );

                    previous.applied = true;
                }
            }

            const schedule =
                t.type === "Swiss System"
                    ? generateSwissPairings(t)
                    : generateGenericPairings(t);

            t.rounds.push({
                number: next,
                pairs: schedule.pairs,
                bye: schedule.bye,
                completed: false,
                applied: false
            });

            saveActiveTournament(t);
            renderActiveTournament();
        }
    );


/* ============================================================
   COMPLETED TOURNAMENT — FINAL PAIRINGS / RESULTS
============================================================ */

function finalStandings(t) {
    return [...t.players].sort((a, b) => {
        if (Number(b.score || 0) !== Number(a.score || 0)) {
            return Number(b.score || 0) - Number(a.score || 0);
        }

        for (const system of t.tiebreaks || []) {
            let av = 0;
            let bv = 0;

            if (
                system === "Buchholz" ||
                system === "Buchholz Cut 1" ||
                system === "Median Buchholz"
            ) {
                av = buchholz(t, a);
                bv = buchholz(t, b);
            } else if (system === "Progressive Score") {
                av = progressiveScore(a);
                bv = progressiveScore(b);
            } else if (system === "Number of Wins") {
                av = a.wins || 0;
                bv = b.wins || 0;
            }

            if (bv !== av) {
                return bv - av;
            }
        }

        return Number(b.elo || 0) - Number(a.elo || 0);
    });
}

function buildRoundSnapshots(t) {
    const state = t.players.map(player => ({
        ...player,
        score: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        opponents: [],
        results: [],
        byes: []
    }));

    const findPlayer = id =>
        state.find(player => player.id === id);

    const snapshotBuchholz = player =>
        (player.opponents || []).reduce(
            (sum, id) =>
                sum +
                Number(
                    findPlayer(id)?.score || 0
                ),
            0
        );

    const snapshotProgressive = player => {
        let total = 0;
        let progressive = 0;

        for (const result of player.results || []) {
            total += Number(result || 0);
            progressive += total;
        }

        return progressive;
    };

    const sortPlayers = players =>
        [...players].sort((a, b) => {
            if (Number(b.score || 0) !== Number(a.score || 0)) {
                return Number(b.score || 0) - Number(a.score || 0);
            }

            for (const system of t.tiebreaks || []) {
                let av = 0;
                let bv = 0;

                if (
                    system === "Buchholz" ||
                    system === "Buchholz Cut 1" ||
                    system === "Median Buchholz"
                ) {
                    av = snapshotBuchholz(a);
                    bv = snapshotBuchholz(b);
                } else if (system === "Progressive Score") {
                    av = snapshotProgressive(a);
                    bv = snapshotProgressive(b);
                } else if (system === "Number of Wins") {
                    av = a.wins || 0;
                    bv = b.wins || 0;
                }

                if (bv !== av) {
                    return bv - av;
                }
            }

            return Number(b.elo || 0) - Number(a.elo || 0);
        });

    const snapshots = [];

    for (const round of t.rounds || []) {
        for (const pair of round.pairs || []) {
            const white = findPlayer(pair.whiteId);
            const black = findPlayer(pair.blackId);

            if (!white || !black || !pair.result) {
                continue;
            }

            if (!white.opponents.includes(black.id)) {
                white.opponents.push(black.id);
            }

            if (!black.opponents.includes(white.id)) {
                black.opponents.push(white.id);
            }

            if (pair.result === "1-0") {
                white.score += 1;
                white.wins += 1;
                white.results.push(1);
                black.losses += 1;
                black.results.push(0);
            } else if (pair.result === "0-1") {
                white.losses += 1;
                white.results.push(0);
                black.score += 1;
                black.wins += 1;
                black.results.push(1);
            } else {
                white.score += 0.5;
                white.draws += 1;
                white.results.push(0.5);
                black.score += 0.5;
                black.draws += 1;
                black.results.push(0.5);
            }
        }

        if (round.bye) {
            const byePlayer =
                findPlayer(round.bye.id);

            if (
                byePlayer &&
                !byePlayer.byes.includes(round.number)
            ) {
                byePlayer.score += 1;
                byePlayer.results.push(1);
                byePlayer.byes.push(round.number);
            }
        }

        const sorted = sortPlayers(state);

        snapshots.push({
            round: round.number,
            leader: sorted[0] || null,
            last:
                sorted[sorted.length - 1] ||
                null,
            standings: sorted.map(player => ({
                id: player.id,
                name: player.name,
                score: player.score
            }))
        });
    }

    return snapshots;
}

function downloadTournamentPairing(t) {
    const rows = [[
        "Tournament",
        "Round",
        "Board",
        "White",
        "White Elo",
        "Black",
        "Black Elo",
        "Result"
    ]];

    for (const round of t.rounds || []) {
        if (round.bye) {
            rows.push([
                t.name,
                round.number,
                "BYE",
                round.bye.name || "",
                round.bye.elo ?? "",
                "BYE",
                "",
                "1-0 (BYE)"
            ]);
        }

        (round.pairs || []).forEach((pair, index) => {
            const white =
                playerById(t, pair.whiteId);

            const black =
                playerById(t, pair.blackId);

            rows.push([
                t.name,
                round.number,
                index + 1,
                white?.name || "Unknown",
                white?.elo ?? "",
                black?.name || "Unknown",
                black?.elo ?? "",
                pair.result || ""
            ]);
        });
    }

    const csv =
        rows
            .map(row =>
                row
                    .map(value => {
                        const valueText =
                            String(value ?? "");

                        return (
                            '"' +
                            valueText.replace(
                                /"/g,
                                '""'
                            ) +
                            '"'
                        );
                    })
                    .join(",")
            )
            .join("\r\n");

    const blob =
        new Blob(
            ["\ufeff" + csv],
            {
                type:
                    "text/csv;charset=utf-8"
            }
        );

    const url =
        URL.createObjectURL(blob);

    const link =
        document.createElement("a");

    const safeName =
        String(
            t.name ||
            "tournament"
        )
            .replace(
                /[^a-z0-9_-]+/gi,
                "_"
            )
            .replace(
                /^_+|_+$/g,
                "") ||
        "tournament";

    link.href = url;
    link.download =
        `${safeName}_pairings.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
}

function renderCompletedTournament(t) {
    const container =
        $("activeTournamentSection");

    if (!container) {
        return;
    }

    const standings =
        finalStandings(t);

    const snapshots =
        buildRoundSnapshots(t);

    const medalFor =
        position => {
            if (position === 1) {
                return "🥇";
            }

            if (position === 2) {
                return "🥈";
            }

            if (position === 3) {
                return "🥉";
            }

            return "";
        };

    const finalRows =
        standings
            .map(
                (player, index) => `
                    <tr>
                        <td class="final-rank">
                            <span>
                                ${index + 1}
                            </span>
                            <span class="final-medal">
                                ${medalFor(index + 1)}
                            </span>
                        </td>

                        <td>
                            <strong>
                                ${escapeHtml(
                                    player.name
                                )}
                            </strong>
                        </td>

                        <td>
                            ${escapeHtml(
                                player.elo
                            )}
                        </td>

                        <td class="standings-points">
                            ${Number(
                                player.score || 0
                            ).toFixed(1)}
                        </td>

                        <td>
                            ${player.wins || 0}
                        </td>

                        <td>
                            ${player.draws || 0}
                        </td>

                        <td>
                            ${player.losses || 0}
                        </td>

                        <td>
                            ${buchholz(
                                t,
                                player
                            ).toFixed(1)}
                        </td>
                    </tr>
                `
            )
            .join("");

    const roundHistory =
        (t.rounds || [])
            .map(round => {
                const snapshot =
                    snapshots.find(
                        item =>
                            item.round ===
                            round.number
                    );

                const pairingRows =
                    (round.pairs || [])
                        .map(
                            (pair, index) => {
                                const white =
                                    playerById(
                                        t,
                                        pair.whiteId
                                    );

                                const black =
                                    playerById(
                                        t,
                                        pair.blackId
                                    );

                                return `
                                    <div class="final-pairing-row">
                                        <span class="final-board">
                                            Board ${index + 1}
                                        </span>

                                        <strong>
                                            ${escapeHtml(
                                                white?.name ||
                                                "Unknown"
                                            )}
                                        </strong>

                                        <span class="final-result">
                                            ${escapeHtml(
                                                pair.result ||
                                                "—"
                                            )}
                                        </span>

                                        <strong>
                                            ${escapeHtml(
                                                black?.name ||
                                                "Unknown"
                                            )}
                                        </strong>
                                    </div>
                                `;
                            }
                        )
                        .join("");

                const byeHtml =
                    round.bye
                        ? `
                            <div class="final-bye-row">
                                <strong>Bye</strong>
                                <span>
                                    ${escapeHtml(
                                        round.bye.name ||
                                        "Unknown"
                                    )}
                                    — 1 point
                                </span>
                            </div>
                        `
                        : "";

                const leader =
                    snapshot?.leader;

                const last =
                    snapshot?.last;

                const miniRows =
                    (snapshot?.standings || [])
                        .map(
                            (player, index) => `
                                <div class="final-mini-row">
                                    <span>
                                        ${index + 1}
                                    </span>

                                    <strong>
                                        ${escapeHtml(
                                            player.name
                                        )}
                                    </strong>

                                    <b>
                                        ${Number(
                                            player.score ||
                                            0
                                        ).toFixed(1)}
                                    </b>
                                </div>
                            `
                        )
                        .join("");

                return `
                    <section class="final-round-card">

                        <div class="final-round-header">

                            <div>
                                <span class="final-round-kicker">
                                    ROUND ${round.number}
                                </span>

                                <h3>
                                    Round ${round.number}
                                    — Completed
                                </h3>
                            </div>

                            <div class="final-round-leaders">

                                <div>
                                    <span>LEADER</span>

                                    <strong>
                                        ${escapeHtml(
                                            leader?.name ||
                                            "—"
                                        )}
                                    </strong>

                                    <small>
                                        ${
                                            leader
                                                ? Number(
                                                      leader.score ||
                                                      0
                                                  ).toFixed(1) +
                                                  " points"
                                                : ""
                                        }
                                    </small>
                                </div>

                                <div>
                                    <span>LAST</span>

                                    <strong>
                                        ${escapeHtml(
                                            last?.name ||
                                            "—"
                                        )}
                                    </strong>

                                    <small>
                                        ${
                                            last
                                                ? Number(
                                                      last.score ||
                                                      0
                                                  ).toFixed(1) +
                                                  " points"
                                                : ""
                                        }
                                    </small>
                                </div>

                            </div>

                        </div>

                        <div class="final-pairings-list">
                            ${byeHtml}
                            ${
                                pairingRows ||
                                `
                                    <div class="empty-state">
                                        No pairings recorded.
                                    </div>
                                `
                            }
                        </div>

                        <div class="final-round-standings">

                            <div class="final-mini-title">
                                Standings after Round ${round.number}
                            </div>

                            <div class="final-mini-grid">
                                ${miniRows}
                            </div>

                        </div>

                    </section>
                `;
            })
            .join("");

    container.innerHTML = `
        <div class="completed-tournament-page">

            <style>
                .completed-tournament-page {
                    width:100%;
                    box-sizing:border-box;
                    animation:profilePageEnter .45s ease both;
                }

                .completed-hero {
                    padding:32px;
                    border-radius:26px;
                    border:1px solid rgba(102,199,255,.24);
                    background:
                        linear-gradient(
                            145deg,
                            rgba(20,24,31,.98),
                            rgba(10,13,18,.98)
                        );
                    box-shadow:
                        0 24px 70px rgba(0,0,0,.30);
                    margin-bottom:26px;
                }

                .completed-hero-top {
                    display:flex;
                    align-items:flex-start;
                    justify-content:space-between;
                    gap:20px;
                }

                .completed-kicker {
                    display:inline-flex;
                    padding:7px 12px;
                    border-radius:999px;
                    color:#66c7ff;
                    border:
                        1px solid
                        rgba(102,199,255,.25);
                    background:
                        rgba(102,199,255,.06);
                    font-size:10px;
                    font-weight:800;
                    letter-spacing:1.5px;
                }

                .completed-hero h1 {
                    margin:14px 0 7px;
                    font-size:34px;
                }

                .completed-hero p {
                    margin:0;
                    opacity:.58;
                }

                .completed-actions {
                    display:flex;
                    gap:10px;
                    flex-wrap:wrap;
                }

                .final-section-card {
                    padding:26px;
                    margin-bottom:26px;
                    border-radius:22px;
                    border:
                        1px solid
                        rgba(255,255,255,.08);
                    background:
                        rgba(255,255,255,.025);
                }

                .final-section-title {
                    display:flex;
                    align-items:end;
                    justify-content:space-between;
                    gap:16px;
                    margin-bottom:18px;
                }

                .final-section-title h2 {
                    margin:0;
                }

                .final-section-title span {
                    opacity:.48;
                    font-size:12px;
                }

                .final-standings-table {
                    width:100%;
                    border-collapse:collapse;
                    min-width:720px;
                }

                .final-standings-table th,
                .final-standings-table td {
                    padding:13px 12px;
                    border-bottom:
                        1px solid
                        rgba(255,255,255,.06);
                    text-align:left;
                }

                .final-standings-table th {
                    opacity:.45;
                    font-size:11px;
                    letter-spacing:.7px;
                }

                .final-rank {
                    display:flex;
                    align-items:center;
                    gap:9px;
                }

                .final-rank > span:first-child {
                    min-width:24px;
                }

                .final-medal {
                    font-size:21px;
                    min-width:25px;
                }

                .final-round-card {
                    margin-bottom:20px;
                    border-radius:20px;
                    border:
                        1px solid
                        rgba(255,255,255,.08);
                    background:
                        rgba(255,255,255,.025);
                    overflow:hidden;
                }

                .final-round-header {
                    padding:20px 22px;
                    display:flex;
                    align-items:center;
                    justify-content:space-between;
                    gap:18px;
                    border-bottom:
                        1px solid
                        rgba(255,255,255,.06);
                }

                .final-round-kicker {
                    color:#66c7ff;
                    font-size:10px;
                    font-weight:800;
                    letter-spacing:1.3px;
                }

                .final-round-header h3 {
                    margin:7px 0 0;
                }

                .final-round-leaders {
                    display:flex;
                    gap:22px;
                }

                .final-round-leaders div {
                    min-width:115px;
                }

                .final-round-leaders span {
                    display:block;
                    font-size:9px;
                    opacity:.42;
                    letter-spacing:1px;
                }

                .final-round-leaders strong {
                    display:block;
                    margin-top:4px;
                }

                .final-round-leaders small {
                    display:block;
                    margin-top:2px;
                    opacity:.48;
                }

                .final-pairings-list {
                    padding:8px 22px;
                }

                .final-pairing-row,
                .final-bye-row {
                    display:grid;
                    grid-template-columns:
                        90px
                        minmax(0,1fr)
                        90px
                        minmax(0,1fr);
                    gap:14px;
                    align-items:center;
                    padding:14px 0;
                    border-bottom:
                        1px solid
                        rgba(255,255,255,.05);
                }

                .final-bye-row {
                    grid-template-columns:
                        90px
                        1fr;
                }

                .final-board {
                    opacity:.42;
                    font-size:11px;
                }

                .final-result {
                    justify-self:center;
                    padding:5px 10px;
                    border-radius:8px;
                    background:
                        rgba(102,199,255,.08);
                    color:#66c7ff;
                    font-weight:800;
                }

                .final-round-standings {
                    padding:
                        18px
                        22px
                        22px;
                }

                .final-mini-title {
                    font-size:11px;
                    opacity:.45;
                    letter-spacing:.8px;
                    margin-bottom:10px;
                }

                .final-mini-grid {
                    display:grid;
                    grid-template-columns:
                        repeat(
                            auto-fit,
                            minmax(210px,1fr)
                        );
                    gap:6px;
                }

                .final-mini-row {
                    display:grid;
                    grid-template-columns:
                        28px
                        1fr
                        45px;
                    gap:8px;
                    padding:8px 10px;
                    border-radius:9px;
                    background:
                        rgba(255,255,255,.025);
                }

                .final-mini-row span {
                    opacity:.42;
                }

                .final-mini-row b {
                    text-align:right;
                }

                @media(max-width:760px) {
                    .completed-hero {
                        padding:22px;
                    }

                    .completed-hero-top,
                    .final-round-header {
                        flex-direction:column;
                        align-items:flex-start;
                    }

                    .final-round-leaders {
                        width:100%;
                        flex-wrap:wrap;
                    }

                    .final-pairing-row {
                        grid-template-columns:
                            70px
                            minmax(0,1fr)
                            70px;
                    }

                    .final-pairing-row
                    strong:last-child {
                        grid-column:2 / 4;
                    }
                }
            </style>

            <section class="completed-hero">

                <div class="completed-hero-top">

                    <div>

                        <span class="completed-kicker">
                            ♞ TOURNAMENT COMPLETED
                        </span>

                        <h1>
                            ${escapeHtml(t.name)}
                        </h1>

                        <p>
                            ${escapeHtml(t.type)}
                            ·
                            ${t.players.length}
                            players
                            ·
                            ${t.totalRounds}
                            rounds
                        </p>

                    </div>

                    <div class="completed-actions">

                        <button
                            type="button"
                            id="downloadTournamentPairingButton"
                            class="primary-button"
                        >
                            Download Pairing
                        </button>

                        <button
                            type="button"
                            id="backToTournamentsFromCompleted"
                            class="secondary-button"
                        >
                            Back to Tournaments
                        </button>

                    </div>

                </div>

            </section>

            <section class="final-section-card">

                <div class="final-section-title">

                    <div>

                        <h2>
                            Final Pairing & Results
                        </h2>

                        <span>
                            Final ranking after
                            Round ${t.totalRounds}
                        </span>

                    </div>

                </div>

                <div style="overflow:auto">

                    <table
                        class="final-standings-table"
                    >

                        <thead>

                            <tr>
                                <th>Place</th>
                                <th>Player</th>
                                <th>Elo</th>
                                <th>Score</th>
                                <th>Wins</th>
                                <th>Draws</th>
                                <th>Losses</th>
                                <th>Buchholz</th>
                            </tr>

                        </thead>

                        <tbody>
                            ${finalRows}
                        </tbody>

                    </table>

                </div>

            </section>

            <section>

                <div class="final-section-title">

                    <div>

                        <h2>
                            All Rounds & Pairings
                        </h2>

                        <span>
                            Every round, result, leader
                            and last-place player
                        </span>

                    </div>

                </div>

                ${roundHistory}

            </section>

        </div>
    `;

    $("downloadTournamentPairingButton")
        ?.addEventListener(
            "click",
            () =>
                downloadTournamentPairing(t)
        );

    $("backToTournamentsFromCompleted")
        ?.addEventListener(
            "click",
            () =>
                showSection("tournaments")
        );
}


function buchholz(
    t,
    p
) {
    return (
        p.opponents || []
    ).reduce(
        (sum, id) => {
            const opp =
                playerById(
                    t,
                    id
                );

            return (
                sum +
                Number(
                    opp?.score || 0
                )
            );
        },
        0
    );
}

function progressiveScore(p) {
    let total = 0;
    let progressive = 0;

    for (
        const r of
        p.results || []
    ) {
        total += r;
        progressive += total;
    }

    return progressive;
}

function renderStandings(t) {
    const sorted =
        [...t.players].sort(
            (a, b) => {
                if (
                    b.score !==
                    a.score
                ) {
                    return (
                        b.score -
                        a.score
                    );
                }

                const tb =
                    t.tiebreaks;

                for (
                    const system
                    of tb
                ) {
                    let av = 0;
                    let bv = 0;

                    if (
                        system ===
                            "Buchholz" ||
                        system ===
                            "Buchholz Cut 1" ||
                        system ===
                            "Median Buchholz"
                    ) {
                        av =
                            buchholz(
                                t,
                                a
                            );

                        bv =
                            buchholz(
                                t,
                                b
                            );

                    } else if (
                        system ===
                        "Progressive Score"
                    ) {
                        av =
                            progressiveScore(
                                a
                            );

                        bv =
                            progressiveScore(
                                b
                            );

                    } else if (
                        system ===
                        "Number of Wins"
                    ) {
                        av =
                            a.wins ||
                            0;

                        bv =
                            b.wins ||
                            0;
                    }

                    if (
                        bv !== av
                    ) {
                        return (
                            bv - av
                        );
                    }
                }

                return (
                    (b.elo || 0) -
                    (a.elo || 0)
                );
            }
        );

    $("standingsContainer")
        .innerHTML = `
            <div style="overflow:auto">

                <table class="standings-table">

                    <thead>

                        <tr>
                            <th>#</th>
                            <th>Player</th>
                            <th>Elo</th>
                            <th>Score</th>
                            <th>Wins</th>
                            <th>Buchholz</th>
                        </tr>

                    </thead>

                    <tbody>

                        ${
                            sorted
                                .map(
                                    (p, i) => `
                                        <tr>

                                            <td class="standings-rank">
                                                ${i + 1}
                                            </td>

                                            <td>
                                                <strong>
                                                    ${escapeHtml(
                                                        p.name
                                                    )}
                                                </strong>
                                            </td>

                                            <td>
                                                ${escapeHtml(
                                                    p.elo
                                                )}
                                            </td>

                                            <td class="standings-points">
                                                ${Number(
                                                    p.score ||
                                                        0
                                                ).toFixed(1)}
                                            </td>

                                            <td>
                                                ${p.wins || 0}
                                            </td>

                                            <td>
                                                ${buchholz(
                                                    t,
                                                    p
                                                ).toFixed(1)}
                                            </td>

                                        </tr>
                                    `
                                )
                                .join("")
                        }

                    </tbody>

                </table>

            </div>
        `;
}


/* ============================================================
   CHESS PLAYER PROFILE
   IMAGE SYSTEM — CIRCULAR CROP + SMALL LOCAL STORAGE PHOTO
============================================================ */

function readProfileImage(file) {
    return new Promise(
        (resolve, reject) => {

            if (!file) {
                resolve("");
                return;
            }

            if (
                !file.type ||
                !file.type.startsWith(
                    "image/"
                )
            ) {
                reject(
                    new Error(
                        "Please select an image file."
                    )
                );

                return;
            }

            if (
                file.size >
                10 * 1024 * 1024
            ) {
                reject(
                    new Error(
                        "The image must be smaller than 10 MB."
                    )
                );

                return;
            }

            const reader =
                new FileReader();

            reader.onload = () => {

                const image =
                    new Image();

                image.onload = () => {

                    const size =
                        Math.min(
                            image.naturalWidth,
                            image.naturalHeight
                        );

                    const canvas =
                        document.createElement(
                            "canvas"
                        );

                    /*
                     * Small square output.
                     * The CSS will display it as a circle.
                     * This keeps localStorage usage very small.
                     */
                    const outputSize = 256;

                    canvas.width =
                        outputSize;

                    canvas.height =
                        outputSize;

                    const ctx =
                        canvas.getContext(
                            "2d"
                        );

                    if (!ctx) {
                        reject(
                            new Error(
                                "Your browser does not support image processing."
                            )
                        );

                        return;
                    }

                    const sx =
                        (
                            image.naturalWidth -
                            size
                        ) / 2;

                    const sy =
                        (
                            image.naturalHeight -
                            size
                        ) / 2;

                    ctx.drawImage(
                        image,
                        sx,
                        sy,
                        size,
                        size,
                        0,
                        0,
                        outputSize,
                        outputSize
                    );

                    /*
                     * Try WebP first because it is usually
                     * much smaller than PNG/JPEG.
                     */
                    let result =
                        canvas.toDataURL(
                            "image/webp",
                            0.72
                        );

                    /*
                     * Some older browsers may return PNG
                     * even when WebP was requested.
                     */
                    if (
                        !result.startsWith(
                            "data:image/webp"
                        )
                    ) {
                        result =
                            canvas.toDataURL(
                                "image/jpeg",
                                0.68
                            );
                    }

                    /*
                     * Safety fallback if the generated
                     * image is still unusually large.
                     */
                    if (
                        result.length >
                        220000
                    ) {
                        result =
                            canvas.toDataURL(
                                "image/jpeg",
                                0.55
                            );
                    }

                    /*
                     * Final emergency reduction.
                     */
                    if (
                        result.length >
                        220000
                    ) {
                        const smallCanvas =
                            document.createElement(
                                "canvas"
                            );

                        smallCanvas.width =
                            160;

                        smallCanvas.height =
                            160;

                        const smallCtx =
                            smallCanvas.getContext(
                                "2d"
                            );

                        smallCtx.drawImage(
                            image,
                            sx,
                            sy,
                            size,
                            size,
                            0,
                            0,
                            160,
                            160
                        );

                        result =
                            smallCanvas.toDataURL(
                                "image/jpeg",
                                0.55
                            );
                    }

                    if (
                        result.length >
                        220000
                    ) {
                        reject(
                            new Error(
                                "The image could not be compressed enough for browser storage."
                            )
                        );

                        return;
                    }

                    resolve(result);
                };

                image.onerror = () => {
                    reject(
                        new Error(
                            "Unable to process the selected image."
                        )
                    );
                };

                image.src =
                    reader.result;
            };

            reader.onerror = () => {
                reject(
                    new Error(
                        "Unable to read the image."
                    )
                );
            };

            reader.readAsDataURL(file);
        }
    );
}


/*
 * Opens a proper circular cropper.
 *
 * The user can:
 * - drag the image
 * - zoom in
 * - zoom out
 * - reset the position
 * - cancel
 * - save the circular crop
 */
function openProfileImageCropper(
    file
) {
    return new Promise(
        (resolve, reject) => {

            if (!file) {
                resolve("");
                return;
            }

            if (
                !file.type ||
                !file.type.startsWith(
                    "image/"
                )
            ) {
                reject(
                    new Error(
                        "Please select an image file."
                    )
                );

                return;
            }

            if (
                file.size >
                10 * 1024 * 1024
            ) {
                reject(
                    new Error(
                        "The image must be smaller than 10 MB."
                    )
                );

                return;
            }

            const reader =
                new FileReader();

            reader.onload = () => {

                const image =
                    new Image();

                image.onload = () => {

                    const overlay =
                        document.createElement(
                            "div"
                        );

                    overlay.id =
                        "profileImageCropper";

                    overlay.style.cssText = `
                        position:fixed;
                        inset:0;
                        z-index:999999;
                        display:flex;
                        align-items:center;
                        justify-content:center;
                        padding:20px;
                        box-sizing:border-box;
                        background:rgba(0,0,0,.82);
                        backdrop-filter:blur(12px);
                    `;

                    overlay.innerHTML = `
                        <div style="
                            width:min(460px,100%);
                            max-height:calc(100vh - 40px);
                            overflow:auto;
                            box-sizing:border-box;
                            padding:24px;
                            border-radius:24px;
                            border:1px solid rgba(102,199,255,.28);
                            background:
                                linear-gradient(
                                    145deg,
                                    #151a22,
                                    #0a0d12
                                );
                            box-shadow:
                                0 30px 100px rgba(0,0,0,.55);
                            color:white;
                        ">

                            <div style="
                                display:flex;
                                align-items:center;
                                justify-content:space-between;
                                gap:12px;
                                margin-bottom:20px;
                            ">

                                <div>
                                    <strong style="
                                        display:block;
                                        font-size:19px;
                                    ">
                                        Adjust Profile Photo
                                    </strong>

                                    <span style="
                                        display:block;
                                        margin-top:5px;
                                        font-size:12px;
                                        opacity:.55;
                                    ">
                                        Move and zoom the image to fit the circle.
                                    </span>
                                </div>

                                <button
                                    type="button"
                                    id="profileCropClose"
                                    style="
                                        width:36px;
                                        height:36px;
                                        border-radius:50%;
                                        border:1px solid rgba(255,255,255,.12);
                                        background:rgba(255,255,255,.05);
                                        color:white;
                                        cursor:pointer;
                                        font-size:20px;
                                    "
                                >
                                    ×
                                </button>

                            </div>


                            <div
                                id="profileCropArea"
                                style="
                                    position:relative;
                                    width:100%;
                                    aspect-ratio:1/1;
                                    max-width:360px;
                                    margin:0 auto;
                                    overflow:hidden;
                                    border-radius:50%;
                                    background:#05070a;
                                    border:3px solid #66c7ff;
                                    box-shadow:
                                        0 0 0 9999px rgba(0,0,0,.22),
                                        0 0 45px rgba(102,199,255,.20);
                                    cursor:grab;
                                    touch-action:none;
                                "
                            >

                                <img
                                    id="profileCropImage"
                                    src="${image.src}"
                                    alt="Crop preview"
                                    draggable="false"
                                    style="
                                        position:absolute;
                                        left:50%;
                                        top:50%;
                                        width:auto;
                                        height:auto;
                                        max-width:none;
                                        max-height:none;
                                        user-select:none;
                                        pointer-events:none;
                                        transform-origin:center center;
                                    "
                                >

                            </div>


                            <div style="
                                display:flex;
                                align-items:center;
                                justify-content:center;
                                gap:12px;
                                margin-top:20px;
                            ">

                                <button
                                    type="button"
                                    id="profileCropZoomOut"
                                    class="secondary-button"
                                    style="
                                        min-width:45px;
                                        font-size:20px;
                                    "
                                >
                                    −
                                </button>

                                <input
                                    id="profileCropZoom"
                                    type="range"
                                    min="1"
                                    max="3"
                                    step="0.01"
                                    value="1"
                                    style="
                                        flex:1;
                                        max-width:230px;
                                        accent-color:#66c7ff;
                                    "
                                >

                                <button
                                    type="button"
                                    id="profileCropZoomIn"
                                    class="secondary-button"
                                    style="
                                        min-width:45px;
                                        font-size:20px;
                                    "
                                >
                                    +
                                </button>

                            </div>


                            <div style="
                                display:flex;
                                justify-content:center;
                                margin-top:12px;
                            ">

                                <button
                                    type="button"
                                    id="profileCropReset"
                                    class="secondary-button"
                                >
                                    Reset Position
                                </button>

                            </div>


                            <div style="
                                display:flex;
                                gap:10px;
                                margin-top:22px;
                            ">

                                <button
                                    type="button"
                                    id="profileCropCancel"
                                    class="secondary-button"
                                    style="
                                        flex:1;
                                    "
                                >
                                    Cancel
                                </button>

                                <button
                                    type="button"
                                    id="profileCropSave"
                                    class="primary-button"
                                    style="
                                        flex:1;
                                    "
                                >
                                    Use Photo
                                </button>

                            </div>

                        </div>
                    `;

                    document.body.appendChild(
                        overlay
                    );

                    const cropArea =
                        overlay.querySelector(
                            "#profileCropArea"
                        );

                    const cropImage =
                        overlay.querySelector(
                            "#profileCropImage"
                        );

                    const zoomSlider =
                        overlay.querySelector(
                            "#profileCropZoom"
                        );

                    let zoom = 1;
                    let offsetX = 0;
                    let offsetY = 0;

                    let dragging = false;
                    let startX = 0;
                    let startY = 0;
                    let startOffsetX = 0;
                    let startOffsetY = 0;

                    function baseImageSize() {
                        const areaSize =
                            cropArea.clientWidth;

                        const imageWidth =
                            image.naturalWidth;

                        const imageHeight =
                            image.naturalHeight;

                        /*
                         * Cover the circle:
                         * whichever dimension is smaller
                         * determines the minimum scale.
                         */
                        const scale =
                            Math.max(
                                areaSize /
                                    imageWidth,
                                areaSize /
                                    imageHeight
                            );

                        return {
                            width:
                                imageWidth *
                                scale,
                            height:
                                imageHeight *
                                scale
                        };
                    }

                    function updateImage() {
                        const size =
                            baseImageSize();

                        cropImage.style.width =
                            `${size.width}px`;

                        cropImage.style.height =
                            `${size.height}px`;

                        cropImage.style.left =
                            `calc(50% + ${offsetX}px)`;

                        cropImage.style.top =
                            `calc(50% + ${offsetY}px)`;

                        cropImage.style.transform =
                            `translate(-50%, -50%) scale(${zoom})`;
                    }

                    function resetPosition() {
                        zoom = 1;
                        offsetX = 0;
                        offsetY = 0;

                        zoomSlider.value =
                            "1";

                        updateImage();
                    }

                    function closeCropper(
                        value
                    ) {
                        overlay.remove();
                        resolve(value);
                    }

                    function cancelCropper() {
                        overlay.remove();
                        resolve("");
                    }

                    function clampPosition() {
                        const areaSize =
                            cropArea.clientWidth;

                        const size =
                            baseImageSize();

                        const displayedWidth =
                            size.width *
                            zoom;

                        const displayedHeight =
                            size.height *
                            zoom;

                        const maxX =
                            Math.max(
                                0,
                                (
                                    displayedWidth -
                                    areaSize
                                ) / 2
                            );

                        const maxY =
                            Math.max(
                                0,
                                (
                                    displayedHeight -
                                    areaSize
                                ) / 2
                            );

                        offsetX =
                            Math.max(
                                -maxX,
                                Math.min(
                                    maxX,
                                    offsetX
                                )
                            );

                        offsetY =
                            Math.max(
                                -maxY,
                                Math.min(
                                    maxY,
                                    offsetY
                                )
                            );
                    }

                    function setZoom(
                        value
                    ) {
                        zoom =
                            Math.max(
                                1,
                                Math.min(
                                    3,
                                    Number(
                                        value
                                    )
                                )
                            );

                        zoomSlider.value =
                            String(zoom);

                        clampPosition();
                        updateImage();
                    }

                    function createCroppedPhoto() {

                        const outputSize =
                            256;

                        const canvas =
                            document.createElement(
                                "canvas"
                            );

                        canvas.width =
                            outputSize;

                        canvas.height =
                            outputSize;

                        const ctx =
                            canvas.getContext(
                                "2d"
                            );

                        if (!ctx) {
                            throw new Error(
                                "Unable to create the cropped image."
                            );
                        }

                        /*
                         * Circular clipping.
                         */
                        ctx.beginPath();

                        ctx.arc(
                            outputSize / 2,
                            outputSize / 2,
                            outputSize / 2,
                            0,
                            Math.PI * 2
                        );

                        ctx.closePath();

                        ctx.clip();

                        /*
                         * Calculate the same image geometry
                         * used by the visual cropper.
                         */
                        const areaSize =
                            cropArea.clientWidth;

                        const imageWidth =
                            image.naturalWidth;

                        const imageHeight =
                            image.naturalHeight;

                        const baseScale =
                            Math.max(
                                areaSize /
                                    imageWidth,
                                areaSize /
                                    imageHeight
                            );

                        const finalScale =
                            baseScale *
                            zoom;

                        const displayedWidth =
                            imageWidth *
                            finalScale;

                        const displayedHeight =
                            imageHeight *
                            finalScale;

                        /*
                         * Convert the screen position
                         * to canvas coordinates.
                         */
                        const left =
                            (
                                areaSize -
                                displayedWidth
                            ) / 2 +
                            offsetX;

                        const top =
                            (
                                areaSize -
                                displayedHeight
                            ) / 2 +
                            offsetY;

                        const scaleOutput =
                            outputSize /
                            areaSize;

                        ctx.drawImage(
                            image,
                            left *
                                scaleOutput,
                            top *
                                scaleOutput,
                            displayedWidth *
                                scaleOutput,
                            displayedHeight *
                                scaleOutput
                        );

                        let result =
                            canvas.toDataURL(
                                "image/webp",
                                0.72
                            );

                        if (
                            !result.startsWith(
                                "data:image/webp"
                            )
                        ) {
                            result =
                                canvas.toDataURL(
                                    "image/jpeg",
                                    0.68
                                );
                        }

                        if (
                            result.length >
                            220000
                        ) {
                            result =
                                canvas.toDataURL(
                                    "image/jpeg",
                                    0.55
                                );
                        }

                        /*
                         * Very small emergency version.
                         */
                        if (
                            result.length >
                            220000
                        ) {
                            const emergency =
                                document.createElement(
                                    "canvas"
                                );

                            emergency.width =
                                160;

                            emergency.height =
                                160;

                            const ectx =
                                emergency.getContext(
                                    "2d"
                                );

                            ectx.beginPath();

                            ectx.arc(
                                80,
                                80,
                                80,
                                0,
                                Math.PI * 2
                            );

                            ectx.closePath();
                            ectx.clip();

                            const emergencyScale =
                                160 /
                                areaSize;

                            ectx.drawImage(
                                image,
                                left *
                                    emergencyScale,
                                top *
                                    emergencyScale,
                                displayedWidth *
                                    emergencyScale,
                                displayedHeight *
                                    emergencyScale
                            );

                            result =
                                emergency.toDataURL(
                                    "image/jpeg",
                                    0.5
                                );
                        }

                        if (
                            result.length >
                            220000
                        ) {
                            throw new Error(
                                "The image is too large to save in browser storage."
                            );
                        }

                        return result;
                    }

                    cropImage.addEventListener(
                        "load",
                        updateImage
                    );

                    overlay
                        .querySelector(
                            "#profileCropClose"
                        )
                        .addEventListener(
                            "click",
                            cancelCropper
                        );

                    overlay
                        .querySelector(
                            "#profileCropCancel"
                        )
                        .addEventListener(
                            "click",
                            cancelCropper
                        );

                    overlay
                        .querySelector(
                            "#profileCropReset"
                        )
                        .addEventListener(
                            "click",
                            resetPosition
                        );

                    overlay
                        .querySelector(
                            "#profileCropZoomIn"
                        )
                        .addEventListener(
                            "click",
                            () =>
                                setZoom(
                                    zoom + 0.1
                                )
                        );

                    overlay
                        .querySelector(
                            "#profileCropZoomOut"
                        )
                        .addEventListener(
                            "click",
                            () =>
                                setZoom(
                                    zoom - 0.1
                                )
                        );

                    zoomSlider.addEventListener(
                        "input",
                        () =>
                            setZoom(
                                zoomSlider.value
                            )
                    );

                    cropArea.addEventListener(
                        "pointerdown",
                        event => {

                            event.preventDefault();

                            dragging = true;

                            cropArea.style.cursor =
                                "grabbing";

                            startX =
                                event.clientX;

                            startY =
                                event.clientY;

                            startOffsetX =
                                offsetX;

                            startOffsetY =
                                offsetY;

                            try {
                                cropArea.setPointerCapture(
                                    event.pointerId
                                );
                            } catch {}
                        }
                    );

                    cropArea.addEventListener(
                        "pointermove",
                        event => {

                            if (!dragging) {
                                return;
                            }

                            event.preventDefault();

                            offsetX =
                                startOffsetX +
                                (
                                    event.clientX -
                                    startX
                                );

                            offsetY =
                                startOffsetY +
                                (
                                    event.clientY -
                                    startY
                                );

                            clampPosition();
                            updateImage();
                        }
                    );

                    function stopDragging() {
                        dragging = false;

                        cropArea.style.cursor =
                            "grab";
                    }

                    cropArea.addEventListener(
                        "pointerup",
                        stopDragging
                    );

                    cropArea.addEventListener(
                        "pointercancel",
                        stopDragging
                    );

                    cropArea.addEventListener(
                        "pointerleave",
                        event => {
                            if (
                                dragging &&
                                event.buttons === 0
                            ) {
                                stopDragging();
                            }
                        }
                    );

                    overlay
                        .querySelector(
                            "#profileCropSave"
                        )
                        .addEventListener(
                            "click",
                            () => {

                                try {

                                    const result =
                                        createCroppedPhoto();

                                    closeCropper(
                                        result
                                    );

                                } catch (
                                    error
                                ) {

                                    alert(
                                        error.message ||
                                        "Could not create the cropped photo."
                                    );
                                }
                            }
                        );

                    /*
                     * Prevent accidental closing when
                     * clicking inside the cropper.
                     */
                    overlay.addEventListener(
                        "click",
                        event => {
                            if (
                                event.target ===
                                overlay
                            ) {
                                cancelCropper();
                            }
                        }
                    );

                    /*
                     * Escape closes cropper.
                     */
                    const escapeHandler =
                        event => {

                            if (
                                event.key ===
                                "Escape"
                            ) {
                                document.removeEventListener(
                                    "keydown",
                                    escapeHandler
                                );

                                cancelCropper();
                            }
                        };

                    document.addEventListener(
                        "keydown",
                        escapeHandler
                    );

                    /*
                     * Initial rendering.
                     */
                    requestAnimationFrame(
                        () => {
                            resetPosition();
                        }
                    );
                };

                image.onerror = () => {
                    reject(
                        new Error(
                            "Unable to process the selected image."
                        )
                    );
                };

                image.src =
                    reader.result;
            };

            reader.onerror = () => {
                reject(
                    new Error(
                        "Unable to read the image."
                    )
                );
            };

            reader.readAsDataURL(file);
        }
    );
}


function renderProfile() {
    const container = $("profileSection");

    if (!container) {
        return;
    }

    const profile = getChessProfile();

    const firstName =
        String(profile.firstName || "").trim();

    const lastName =
        String(profile.lastName || "").trim();

    const fullName =
        [firstName, lastName]
            .filter(Boolean)
            .join(" ") ||
        String(profile.name || "").trim();

    const email =
        String(
            profile.email ||
            (currentEmail() !== "local_guest"
                ? currentEmail()
                : "")
        ).trim();

    /*
     * A profile is considered complete only when both the
     * first and last name are present. This makes the page
     * switch from setup mode to the final profile view
     * immediately after confirmation.
     */
    const profileComplete =
        Boolean(firstName && lastName);

    /*
     * ------------------------------------------------------------
     * PROFILE SETUP
     * ------------------------------------------------------------
     */
    if (!profileComplete || profileEditMode) {
        container.innerHTML = `
            <div class="profile-page profile-setup-page">

                <div class="profile-setup-card">

                    <div class="profile-setup-header">
                        <div>
                            <span class="profile-kicker">
                                ♞ CHESS PROFILE
                            </span>

                            <h2>
                                ${profileEditMode ? "Edit your profile" : "Create your profile"}
                            </h2>

                            <p>
                                ${profileEditMode
                                    ? "Change your name or profile photo. Your account email remains linked automatically and cannot be edited here."
                                    : "Add your photo and name once. After confirmation, your complete profile and tournament history will appear here automatically."}
                            </p>
                        </div>

                        <div class="profile-setup-icon">
                            ♟
                        </div>
                    </div>

                    <div class="profile-setup-content">

                        <div class="profile-photo-column">

                            <div
                                id="profilePhotoPreview"
                                class="profile-photo-preview"
                            >
                                ${
                                    profile.photo
                                        ? `
                                            <img
                                                src="${escapeHtml(profile.photo)}"
                                                alt="Profile photo"
                                            >
                                        `
                                        : `
                                            <div class="profile-photo-placeholder">
                                                <span>♞</span>
                                                <small>PHOTO</small>
                                            </div>
                                        `
                                }
                            </div>

                            <label
                                for="chessProfilePhoto"
                                class="profile-upload-button"
                            >
                                ${profileEditMode ? "Change Photo" : "Choose Photo"}
                            </label>

                            <input
                                type="file"
                                id="chessProfilePhoto"
                                accept="image/*"
                                hidden
                            >

                            ${
                                profile.photo
                                    ? `
                                        <button
                                            type="button"
                                            id="removeProfilePhoto"
                                            class="profile-remove-button"
                                        >
                                            Remove Photo
                                        </button>
                                    `
                                    : ""
                            }

                            <small class="profile-photo-help">
                                JPG, PNG, WEBP · Maximum 10 MB
                            </small>

                        </div>

                        <div class="profile-fields">

                            <div class="profile-field">
                                <label for="chessProfileFirstName">
                                    First Name
                                </label>

                                <input
                                    id="chessProfileFirstName"
                                    type="text"
                                    value="${escapeHtml(firstName)}"
                                    placeholder="Enter your first name"
                                    autocomplete="given-name"
                                >
                            </div>

                            <div class="profile-field">
                                <label for="chessProfileLastName">
                                    Last Name
                                </label>

                                <input
                                    id="chessProfileLastName"
                                    type="text"
                                    value="${escapeHtml(lastName)}"
                                    placeholder="Enter your last name"
                                    autocomplete="family-name"
                                >
                            </div>

                            <div class="profile-field">
                                <label>
                                    Email
                                </label>

                                <div class="profile-email-display">
                                    <span>✉</span>
                                    <span>
                                        ${
                                            escapeHtml(
                                                email ||
                                                "Email not available"
                                            )
                                        }
                                    </span>
                                </div>

                                <small>
                                    Your email is taken from the
                                    current account and cannot be
                                    edited here.
                                </small>
                            </div>

                            <div style="display:flex;gap:10px;flex-wrap:wrap;">
                                ${
                                    profileEditMode
                                        ? `
                                            <button
                                                type="button"
                                                id="cancelEditProfileButton"
                                                class="profile-cancel-button"
                                            >
                                                Cancel
                                            </button>
                                        `
                                        : ""
                                }

                                <button
                                    type="button"
                                    id="saveChessProfileButton"
                                    class="profile-confirm-button"
                                    style="flex:1;min-width:180px;"
                                >
                                    ${profileEditMode ? "Save Changes" : "Confirm & Save Profile"}
                                </button>
                            </div>

                        </div>

                    </div>

                </div>

                <style>
                    .profile-page {
                        width:100%;
                        box-sizing:border-box;
                        animation:profilePageEnter .45s ease both;
                    }

                    .profile-setup-card {
                        width:100%;
                        box-sizing:border-box;
                        padding:34px;
                        border-radius:28px;
                        border:1px solid rgba(102,199,255,.25);
                        background:
                            radial-gradient(
                                circle at 95% 5%,
                                rgba(102,199,255,.13),
                                transparent 28%
                            ),
                            radial-gradient(
                                circle at 0% 100%,
                                rgba(102,199,255,.08),
                                transparent 32%
                            ),
                            linear-gradient(
                                145deg,
                                rgba(20,24,31,.98),
                                rgba(10,13,18,.98)
                            );
                        box-shadow:
                            0 24px 70px rgba(0,0,0,.32),
                            inset 0 1px 0 rgba(255,255,255,.035);
                    }

                    .profile-setup-header {
                        display:flex;
                        align-items:center;
                        justify-content:space-between;
                        gap:24px;
                        margin-bottom:30px;
                    }

                    .profile-kicker {
                        display:inline-flex;
                        align-items:center;
                        gap:7px;
                        padding:7px 12px;
                        border-radius:999px;
                        border:1px solid rgba(102,199,255,.25);
                        background:rgba(102,199,255,.06);
                        color:#66c7ff;
                        font-size:11px;
                        font-weight:800;
                        letter-spacing:1.5px;
                    }

                    .profile-setup-header h2 {
                        margin:14px 0 8px;
                        font-size:32px;
                        line-height:1.15;
                    }

                    .profile-setup-header p {
                        margin:0;
                        max-width:650px;
                        opacity:.62;
                        line-height:1.7;
                    }

                    .profile-setup-icon {
                        width:82px;
                        height:82px;
                        flex:0 0 82px;
                        display:flex;
                        align-items:center;
                        justify-content:center;
                        border-radius:24px;
                        color:#66c7ff;
                        font-size:38px;
                        background:rgba(102,199,255,.07);
                        border:1px solid rgba(102,199,255,.18);
                    }

                    .profile-setup-content {
                        display:grid;
                        grid-template-columns:260px minmax(0,1fr);
                        gap:32px;
                        align-items:start;
                    }

                    .profile-photo-column {
                        display:flex;
                        flex-direction:column;
                        align-items:center;
                    }

                    .profile-photo-preview {
                        width:190px;
                        height:190px;
                        border-radius:50%;
                        padding:5px;
                        box-sizing:border-box;
                        background:
                            linear-gradient(
                                145deg,
                                #66c7ff,
                                rgba(102,199,255,.12)
                            );
                        box-shadow:
                            0 0 0 1px rgba(102,199,255,.14),
                            0 18px 45px rgba(0,0,0,.35);
                        overflow:hidden;
                    }

                    .profile-photo-preview img {
                        width:100%;
                        height:100%;
                        display:block;
                        object-fit:cover;
                        border-radius:50%;
                    }

                    .profile-photo-placeholder {
                        width:100%;
                        height:100%;
                        border-radius:50%;
                        display:flex;
                        flex-direction:column;
                        align-items:center;
                        justify-content:center;
                        background:#0b1016;
                        color:#66c7ff;
                    }

                    .profile-photo-placeholder span {
                        font-size:55px;
                        line-height:1;
                    }

                    .profile-photo-placeholder small {
                        margin-top:9px;
                        font-size:9px;
                        letter-spacing:2px;
                        opacity:.55;
                    }

                    .profile-upload-button,
                    .profile-remove-button {
                        width:190px;
                        box-sizing:border-box;
                        margin-top:18px;
                        padding:12px 15px;
                        border-radius:12px;
                        text-align:center;
                        cursor:pointer;
                        transition:
                            transform .18s ease,
                            border-color .18s ease,
                            background .18s ease;
                    }

                    .profile-upload-button {
                        border:1px solid rgba(102,199,255,.35);
                        background:rgba(102,199,255,.08);
                        color:#66c7ff;
                        font-weight:700;
                    }

                    .profile-remove-button {
                        border:1px solid rgba(255,85,85,.3);
                        background:rgba(255,85,85,.05);
                        color:#ff7777;
                    }

                    .profile-upload-button:hover,
                    .profile-remove-button:hover {
                        transform:translateY(-1px);
                    }

                    .profile-photo-help {
                        margin-top:10px;
                        text-align:center;
                        opacity:.42;
                        line-height:1.5;
                    }

                    .profile-fields {
                        display:flex;
                        flex-direction:column;
                        gap:18px;
                    }

                    .profile-field {
                        display:flex;
                        flex-direction:column;
                        gap:8px;
                    }

                    .profile-field label {
                        font-size:12px;
                        font-weight:700;
                        opacity:.72;
                    }

                    .profile-field input {
                        width:100%;
                        box-sizing:border-box;
                        padding:14px 15px;
                        border-radius:12px;
                        border:1px solid rgba(255,255,255,.09);
                        outline:none;
                        background:rgba(255,255,255,.035);
                        color:inherit;
                        font:inherit;
                        transition:
                            border-color .18s ease,
                            box-shadow .18s ease;
                    }

                    .profile-field input:focus {
                        border-color:#66c7ff;
                        box-shadow:
                            0 0 0 3px
                            rgba(102,199,255,.08);
                    }

                    .profile-email-display {
                        min-height:48px;
                        box-sizing:border-box;
                        display:flex;
                        align-items:center;
                        gap:10px;
                        padding:12px 15px;
                        border-radius:12px;
                        border:1px solid rgba(255,255,255,.07);
                        background:rgba(255,255,255,.025);
                        opacity:.8;
                    }

                    .profile-email-display span:first-child {
                        color:#66c7ff;
                    }

                    .profile-field small {
                        font-size:11px;
                        opacity:.42;
                    }

                    .profile-confirm-button {
                        width:100%;
                        margin-top:5px;
                        padding:15px 18px;
                        border:0;
                        border-radius:13px;
                        cursor:pointer;
                        background:#66c7ff;
                        color:#071019;
                        font:inherit;
                        font-weight:800;
                        transition:
                            transform .18s ease,
                            box-shadow .18s ease;
                        box-shadow:
                            0 10px 25px
                            rgba(102,199,255,.16);
                    }

                    .profile-confirm-button:hover {
                        transform:translateY(-1px);
                        box-shadow:
                            0 14px 30px
                            rgba(102,199,255,.22);
                    }

                    .profile-cancel-button {
                        flex:0 0 auto;
                        padding:15px 18px;
                        border:1px solid rgba(255,255,255,.12);
                        border-radius:13px;
                        cursor:pointer;
                        background:rgba(255,255,255,.035);
                        color:inherit;
                        font:inherit;
                        font-weight:700;
                    }

                    .profile-cancel-button:hover {
                        border-color:rgba(255,255,255,.22);
                    }

                    @keyframes profilePageEnter {
                        from {
                            opacity:0;
                            transform:translateY(14px);
                        }
                        to {
                            opacity:1;
                            transform:translateY(0);
                        }
                    }

                    @media (max-width:760px) {
                        .profile-setup-card {
                            padding:22px;
                        }

                        .profile-setup-header {
                            align-items:flex-start;
                        }

                        .profile-setup-icon {
                            display:none;
                        }

                        .profile-setup-header h2 {
                            font-size:26px;
                        }

                        .profile-setup-content {
                            grid-template-columns:1fr;
                        }

                        .profile-photo-preview {
                            width:165px;
                            height:165px;
                        }

                        .profile-upload-button,
                        .profile-remove-button {
                            width:165px;
                        }
                    }
                </style>
            </div>
        `;

        const photoInput = $("chessProfilePhoto");

        if (photoInput) {
            photoInput.addEventListener(
                "change",
                async event => {
                    const file =
                        event.target.files?.[0];

                    if (!file) {
                        return;
                    }

                    try {
                        const photo =
                            await openProfileImageCropper(file);

                        if (!photo) {
                            event.target.value = "";
                            return;
                        }

                        const updatedProfile =
                            getChessProfile();

                        updatedProfile.photo = photo;

                        const saved =
                            saveChessProfile(
                                updatedProfile
                            );

                        if (!saved) {
                            throw new Error(
                                "The photo could not be saved. Your browser storage may be full."
                            );
                        }

                        renderProfile();

                    } catch (error) {
                        console.error(
                            "Profile photo error:",
                            error
                        );

                        alert(
                            error.message ||
                            "Could not load or save the selected image."
                        );

                        event.target.value = "";
                    }
                }
            );
        }

        const removePhoto =
            $("removeProfilePhoto");

        if (removePhoto) {
            removePhoto.addEventListener(
                "click",
                () => {
                    if (
                        !confirm(
                            "Remove your profile photo?"
                        )
                    ) {
                        return;
                    }

                    const updatedProfile =
                        getChessProfile();

                    updatedProfile.photo = "";

                    const saved =
                        saveChessProfile(
                            updatedProfile
                        );

                    if (!saved) {
                        return alert(
                            "The photo could not be removed."
                        );
                    }

                    renderProfile();
                }
            );
        }

        const cancelEditButton =
            $("cancelEditProfileButton");

        if (cancelEditButton) {
            cancelEditButton.addEventListener(
                "click",
                () => {
                    profileEditMode = false;
                    renderProfile();
                }
            );
        }

        const saveButton =
            $("saveChessProfileButton");

        if (saveButton) {
            saveButton.addEventListener(
                "click",
                () => {
                    const first =
                        $("chessProfileFirstName")
                            ?.value
                            .trim() || "";

                    const last =
                        $("chessProfileLastName")
                            ?.value
                            .trim() || "";

                    if (!first) {
                        return alert(
                            "Please enter your first name."
                        );
                    }

                    if (!last) {
                        return alert(
                            "Please enter your last name."
                        );
                    }

                    const currentProfile =
                        getChessProfile();

                    const saved =
                        saveChessProfile({
                            ...currentProfile,
                            firstName: first,
                            lastName: last,
                            name:
                                `${first} ${last}`.trim(),
                            email:
                                currentProfile.email ||
                                (
                                    currentEmail() !==
                                    "local_guest"
                                        ? currentEmail()
                                        : ""
                                ),
                            chessId:
                                currentProfile.chessId ||
                                "",
                            photo:
                                currentProfile.photo ||
                                ""
                        });

                    if (!saved) {
                        return alert(
                            "Profile could not be saved. Your browser storage may be full."
                        );
                    }

                    /* Return to the final profile view after saving. */
                    profileEditMode = false;
                    renderProfile();
                }
            );
        }

        return;
    }

    /*
     * ------------------------------------------------------------
     * FINAL PROFILE + REAL TOURNAMENT HISTORY
     * ------------------------------------------------------------
     */

    const myTournaments =
        loadTournaments()
            .filter(
                tournament =>
                    String(tournament?.owner || "")
                        .trim()
                        .toLowerCase() ===
                    String(currentEmail() || "")
                        .trim()
                        .toLowerCase()
            )
            .sort(
                (a, b) =>
                    new Date(
                        b?.createdAt || 0
                    ) -
                    new Date(
                        a?.createdAt || 0
                    )
            );

    const getTournamentStatus = tournament => {
        const totalRounds =
            Number(tournament?.totalRounds || 0);

        const rounds =
            Array.isArray(tournament?.rounds)
                ? tournament.rounds
                : [];

        if (
            totalRounds > 0 &&
            rounds.length >= totalRounds
        ) {
            return "Completed";
        }

        const lastRound =
            rounds[rounds.length - 1];

        if (
            lastRound?.completed &&
            totalRounds > 0 &&
            rounds.length >= totalRounds
        ) {
            return "Completed";
        }

        return "Active";
    };

    const statusClass = status =>
        status === "Completed"
            ? "completed"
            : "active";

    const formatDate = value => {
        if (!value) {
            return "—";
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "—";
        }

        return date.toLocaleDateString(
            undefined,
            {
                year: "numeric",
                month: "short",
                day: "numeric"
            }
        );
    };

    const tournamentCards =
        myTournaments.length
            ? myTournaments
                  .map(tournament => {
                      const players =
                          Array.isArray(
                              tournament?.players
                          )
                              ? tournament.players
                              : [];

                      const rounds =
                          Array.isArray(
                              tournament?.rounds
                          )
                              ? tournament.rounds
                              : [];

                      const totalRounds =
                          Number(
                              tournament?.totalRounds ||
                              0
                          );

                      const status =
                          getTournamentStatus(
                              tournament
                          );

                      return `
                          <article
                              class="profile-tournament-card"
                          >
                              <div class="profile-tournament-top">

                                  <div class="profile-tournament-title-wrap">

                                      <div class="profile-tournament-symbol">
                                          ♞
                                      </div>

                                      <div>
                                          <h3>
                                              ${escapeHtml(
                                                  tournament?.name ||
                                                  "Unnamed Tournament"
                                              )}
                                          </h3>

                                          <span>
                                              ${escapeHtml(
                                                  tournament?.type ||
                                                  "Tournament"
                                              )}
                                          </span>
                                      </div>

                                  </div>

                                  <span
                                      class="
                                          profile-status
                                          ${statusClass(status)}
                                      "
                                  >
                                      <i></i>
                                      ${status}
                                  </span>

                              </div>

                              <div class="profile-tournament-details">

                                  <div class="profile-stat">
                                      <span>PLAYERS</span>
                                      <strong>
                                          ${players.length}
                                      </strong>
                                  </div>

                                  <div class="profile-stat">
                                      <span>ROUNDS</span>
                                      <strong>
                                          ${rounds.length}/${totalRounds}
                                      </strong>
                                  </div>

                                  <div class="profile-stat">
                                      <span>CREATED</span>
                                      <strong>
                                          ${escapeHtml(
                                              formatDate(
                                                  tournament?.createdAt
                                              )
                                          )}
                                      </strong>
                                  </div>

                              </div>
                          </article>
                      `;
                  })
                  .join("")
            : `
                  <div class="profile-history-empty">
                      <div class="profile-empty-icon">
                          ♟
                      </div>

                      <h3>
                          No tournaments created yet
                      </h3>

                      <p>
                          Your tournaments will appear here
                          automatically after you create them.
                      </p>
                  </div>
              `;

    container.innerHTML = `
        <div class="profile-page profile-final-page">

            <section class="profile-hero-card">

                <div class="profile-hero-glow glow-one"></div>
                <div class="profile-hero-glow glow-two"></div>

                <div class="profile-hero-content">

                    <div class="profile-final-photo">
                        ${
                            profile.photo
                                ? `
                                    <img
                                        src="${escapeHtml(profile.photo)}"
                                        alt="${escapeHtml(fullName)}"
                                    >
                                `
                                : `
                                    <div class="profile-final-placeholder">
                                        ♞
                                    </div>
                                `
                        }
                    </div>

                    <div class="profile-final-identity">

                        <span class="profile-kicker">
                            ♞ PLAYER PROFILE
                        </span>

                        <h1>
                            ${escapeHtml(fullName)}
                        </h1>

                        <div class="profile-final-email">
                            <span>✉</span>
                            <span>
                                ${escapeHtml(
                                    email ||
                                    "Email not available"
                                )}
                            </span>
                        </div>

                        <button
                            type="button"
                            id="editChessProfileButton"
                            class="profile-edit-button"
                        >
                            ✎ Edit Profile
                        </button>

                    </div>

                </div>

            </section>

            <section class="profile-history-section">

                <div class="profile-history-heading">

                    <div>
                        <span class="profile-kicker">
                            TOURNAMENTS
                        </span>

                        <h2>
                            Tournament History
                        </h2>

                        <p>
                            Every tournament created by your
                            account appears here using the
                            project's existing tournament data.
                        </p>
                    </div>

                    <div class="profile-tournament-count">
                        <strong>
                            ${myTournaments.length}
                        </strong>
                        <span>
                            ${
                                myTournaments.length === 1
                                    ? "Tournament"
                                    : "Tournaments"
                            }
                        </span>
                    </div>

                </div>

                <div class="profile-tournament-list">
                    ${tournamentCards}
                </div>

            </section>

        </div>

        <style>
            .profile-final-page {
                width:100%;
                box-sizing:border-box;
                animation:profilePageEnter .5s ease both;
            }

            .profile-hero-card {
                position:relative;
                width:100%;
                min-height:245px;
                box-sizing:border-box;
                overflow:hidden;
                border-radius:28px;
                border:1px solid rgba(102,199,255,.25);
                background:
                    radial-gradient(
                        circle at 85% 10%,
                        rgba(102,199,255,.16),
                        transparent 30%
                    ),
                    linear-gradient(
                        145deg,
                        rgba(20,24,31,.98),
                        rgba(10,13,18,.98)
                    );
                box-shadow:
                    0 24px 70px rgba(0,0,0,.30),
                    inset 0 1px 0 rgba(255,255,255,.035);
            }

            .profile-hero-glow {
                position:absolute;
                border:1px solid rgba(102,199,255,.10);
                border-radius:50%;
                pointer-events:none;
            }

            .profile-hero-glow.glow-one {
                width:260px;
                height:260px;
                right:-110px;
                top:-130px;
            }

            .profile-hero-glow.glow-two {
                width:170px;
                height:170px;
                left:-90px;
                bottom:-110px;
            }

            .profile-hero-content {
                position:relative;
                z-index:1;
                min-height:245px;
                box-sizing:border-box;
                display:flex;
                align-items:center;
                gap:30px;
                padding:35px 40px;
            }

            .profile-final-photo {
                width:155px;
                height:155px;
                flex:0 0 155px;
                box-sizing:border-box;
                padding:5px;
                border-radius:50%;
                background:
                    linear-gradient(
                        145deg,
                        #66c7ff,
                        rgba(102,199,255,.12)
                    );
                box-shadow:
                    0 0 0 1px rgba(102,199,255,.18),
                    0 18px 45px rgba(0,0,0,.38);
            }

            .profile-final-photo img,
            .profile-final-placeholder {
                width:100%;
                height:100%;
                display:block;
                border-radius:50%;
                object-fit:cover;
            }

            .profile-final-placeholder {
                display:flex;
                align-items:center;
                justify-content:center;
                background:#0b1016;
                color:#66c7ff;
                font-size:58px;
            }

            .profile-final-identity {
                min-width:0;
            }

            .profile-final-identity h1 {
                margin:13px 0 10px;
                font-size:38px;
                line-height:1.12;
                letter-spacing:-.7px;
                word-break:break-word;
            }

            .profile-final-email {
                display:flex;
                align-items:center;
                gap:9px;
                font-size:14px;
                opacity:.58;
                word-break:break-all;
            }

            .profile-final-email span:first-child {
                color:#66c7ff;
                opacity:1;
            }

            .profile-edit-button {
                margin-top:17px;
                padding:10px 15px;
                border:1px solid rgba(102,199,255,.28);
                border-radius:11px;
                background:rgba(102,199,255,.07);
                color:#66c7ff;
                cursor:pointer;
                font:inherit;
                font-size:12px;
                font-weight:800;
                transition:transform .18s ease, background .18s ease;
            }

            .profile-edit-button:hover {
                transform:translateY(-1px);
                background:rgba(102,199,255,.11);
            }

            .profile-kicker {
                display:inline-flex;
                align-items:center;
                gap:7px;
                padding:7px 12px;
                border-radius:999px;
                border:1px solid rgba(102,199,255,.25);
                background:rgba(102,199,255,.06);
                color:#66c7ff;
                font-size:10px;
                font-weight:800;
                letter-spacing:1.5px;
            }

            .profile-history-section {
                margin-top:30px;
            }

            .profile-history-heading {
                display:flex;
                align-items:flex-end;
                justify-content:space-between;
                gap:25px;
                margin-bottom:20px;
            }

            .profile-history-heading h2 {
                margin:12px 0 7px;
                font-size:27px;
                line-height:1.2;
            }

            .profile-history-heading p {
                margin:0;
                max-width:680px;
                opacity:.55;
                line-height:1.6;
                font-size:13px;
            }

            .profile-tournament-count {
                min-width:90px;
                padding:13px 17px;
                box-sizing:border-box;
                border-radius:15px;
                text-align:center;
                border:1px solid rgba(102,199,255,.15);
                background:rgba(102,199,255,.045);
            }

            .profile-tournament-count strong {
                display:block;
                color:#66c7ff;
                font-size:24px;
                line-height:1;
            }

            .profile-tournament-count span {
                display:block;
                margin-top:6px;
                font-size:10px;
                opacity:.5;
                text-transform:uppercase;
                letter-spacing:.8px;
            }

            .profile-tournament-list {
                display:grid;
                grid-template-columns:
                    repeat(
                        auto-fit,
                        minmax(280px, 1fr)
                    );
                gap:17px;
            }

            .profile-tournament-card {
                position:relative;
                padding:20px;
                border-radius:20px;
                border:1px solid rgba(255,255,255,.07);
                background:
                    linear-gradient(
                        145deg,
                        rgba(255,255,255,.035),
                        rgba(255,255,255,.018)
                    );
                box-shadow:
                    0 12px 35px rgba(0,0,0,.15);
                transition:
                    transform .2s ease,
                    border-color .2s ease,
                    box-shadow .2s ease;
            }

            .profile-tournament-card:hover {
                transform:translateY(-3px);
                border-color:rgba(102,199,255,.22);
                box-shadow:
                    0 18px 42px rgba(0,0,0,.24);
            }

            .profile-tournament-top {
                display:flex;
                align-items:flex-start;
                justify-content:space-between;
                gap:14px;
            }

            .profile-tournament-title-wrap {
                display:flex;
                align-items:center;
                gap:12px;
                min-width:0;
            }

            .profile-tournament-symbol {
                width:40px;
                height:40px;
                flex:0 0 40px;
                display:flex;
                align-items:center;
                justify-content:center;
                border-radius:12px;
                background:rgba(102,199,255,.08);
                color:#66c7ff;
                border:1px solid rgba(102,199,255,.12);
            }

            .profile-tournament-title-wrap h3 {
                margin:0;
                font-size:15px;
                line-height:1.35;
                overflow-wrap:anywhere;
            }

            .profile-tournament-title-wrap span {
                display:block;
                margin-top:4px;
                font-size:11px;
                opacity:.48;
                overflow-wrap:anywhere;
            }

            .profile-status {
                display:inline-flex;
                align-items:center;
                gap:6px;
                flex:0 0 auto;
                padding:6px 9px;
                border-radius:999px;
                font-size:9px;
                font-weight:800;
                letter-spacing:.6px;
                text-transform:uppercase;
            }

            .profile-status i {
                width:6px;
                height:6px;
                border-radius:50%;
                display:block;
            }

            .profile-status.active {
                color:#66c7ff;
                background:rgba(102,199,255,.08);
                border:1px solid rgba(102,199,255,.15);
            }

            .profile-status.active i {
                background:#66c7ff;
                box-shadow:
                    0 0 8px rgba(102,199,255,.65);
            }

            .profile-status.completed {
                color:#79e0a0;
                background:rgba(121,224,160,.07);
                border:1px solid rgba(121,224,160,.14);
            }

            .profile-status.completed i {
                background:#79e0a0;
                box-shadow:
                    0 0 8px rgba(121,224,160,.55);
            }

            .profile-tournament-details {
                display:grid;
                grid-template-columns:
                    repeat(3,1fr);
                gap:8px;
                margin-top:20px;
                padding-top:17px;
                border-top:1px solid rgba(255,255,255,.06);
            }

            .profile-stat {
                min-width:0;
            }

            .profile-stat span {
                display:block;
                font-size:8px;
                letter-spacing:1px;
                opacity:.38;
                margin-bottom:6px;
            }

            .profile-stat strong {
                display:block;
                font-size:12px;
                font-weight:700;
                overflow-wrap:anywhere;
            }

            .profile-history-empty {
                padding:55px 20px;
                border-radius:22px;
                text-align:center;
                border:1px dashed rgba(102,199,255,.18);
                background:rgba(102,199,255,.025);
            }

            .profile-empty-icon {
                width:55px;
                height:55px;
                margin:0 auto 15px;
                display:flex;
                align-items:center;
                justify-content:center;
                border-radius:17px;
                background:rgba(102,199,255,.07);
                color:#66c7ff;
                font-size:26px;
            }

            .profile-history-empty h3 {
                margin:0 0 7px;
                font-size:17px;
            }

            .profile-history-empty p {
                margin:0;
                opacity:.48;
                font-size:12px;
            }

            @keyframes profilePageEnter {
                from {
                    opacity:0;
                    transform:translateY(14px);
                }
                to {
                    opacity:1;
                    transform:translateY(0);
                }
            }

            @media (max-width:760px) {
                .profile-hero-content {
                    min-height:0;
                    padding:27px 22px;
                    flex-direction:column;
                    align-items:flex-start;
                }

                .profile-final-photo {
                    width:125px;
                    height:125px;
                    flex-basis:125px;
                }

                .profile-final-identity h1 {
                    font-size:29px;
                }

                .profile-history-heading {
                    align-items:flex-start;
                    flex-direction:column;
                }

                .profile-tournament-count {
                    min-width:100px;
                }
            }

            @media (max-width:430px) {
                .profile-tournament-top {
                    flex-direction:column;
                }

                .profile-tournament-details {
                    grid-template-columns:1fr 1fr;
                }

                .profile-stat:last-child {
                    grid-column:1 / -1;
                }
            }
        </style>
    `;

    const editProfileButton =
        $("editChessProfileButton");

    if (editProfileButton) {
        editProfileButton.addEventListener(
            "click",
            () => {
                profileEditMode = true;
                renderProfile();
            }
        );
    }
}


/* ============================================================
   LOGOUT
============================================================ */

$("logoutButton")
    .addEventListener(
        "click",
        () => {

            localStorage.removeItem(
                SESSION_KEY
            );

            localStorage.removeItem(
                "userEmail"
            );

            window.location.href =
                "login.html";
        }
    );


/* ============================================================
   INITIAL STATE
============================================================ */

try {
    renderTournamentList();
    renderProfile();
    updateRoundOptions();
} catch (error) {
    console.error(
        "Initial dashboard rendering error:",
        error
    );
}

});