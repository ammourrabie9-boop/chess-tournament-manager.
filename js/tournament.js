document.addEventListener("DOMContentLoaded", function () {

    const playerName = document.getElementById("playerName");
    const playerElo = document.getElementById("playerElo");
    const playerId = document.getElementById("playerId");

    const addPlayerButton = document.getElementById("addPlayerButton");
    const playersList = document.getElementById("playersList");
    const playerCountDisplay = document.getElementById("playerCountDisplay");

    const backButton = document.getElementById("backButton");
    const tournamentForm = document.getElementById("tournamentForm");


    let players = [];


    /* ================================
       UPDATE PLAYER COUNT
    ================================= */

    function updatePlayerCount() {

        playerCountDisplay.textContent =
            "Players: " + players.length;

    }


    /* ================================
       DISPLAY PLAYERS
    ================================= */

    function displayPlayers() {

        playersList.innerHTML = "";


        players.forEach(function (player, index) {

            const playerRow = document.createElement("div");

            playerRow.className = "player-row";


            playerRow.innerHTML = `

                <div class="player-number">
                    ${index + 1}
                </div>

                <div class="player-information">

                    <strong>
                        ${player.name}
                    </strong>

                    <span>
                        Elo: ${player.elo}
                    </span>

                    ${
                        player.id
                            ? `<span>ID: ${player.id}</span>`
                            : ""
                    }

                </div>

            `;


            playersList.appendChild(playerRow);

        });


        updatePlayerCount();

    }


    /* ================================
       ADD PLAYER
    ================================= */

    addPlayerButton.addEventListener("click", function () {

        const name = playerName.value.trim();
        const elo = playerElo.value.trim();
        const id = playerId.value.trim();


        if (name === "") {

            alert("Please enter the player's name.");

            playerName.focus();

            return;
        }


        if (elo === "") {

            alert("Please enter the player's Elo.");

            playerElo.focus();

            return;
        }


        players.push({
            name: name,
            elo: elo,
            id: id
        });


        displayPlayers();


        playerName.value = "";
        playerElo.value = "";
        playerId.value = "";


        playerName.focus();

    });


    /* ================================
       BACK BUTTON
    ================================= */

    if (backButton) {

        backButton.addEventListener("click", function () {

            window.location.href = "dashboard.html";

        });

    }


    /* ================================
       CREATE TOURNAMENT
    ================================= */

    tournamentForm.addEventListener("submit", function (event) {

        event.preventDefault();


        const tournamentName =
            document.getElementById("tournamentName").value.trim();

        const tournamentType =
            document.getElementById("tournamentType").value;


        if (tournamentName === "") {

            alert("Please enter a tournament name.");

            return;

        }


        if (tournamentType === "") {

            alert("Please select a tournament type.");

            return;

        }


        if (players.length < 2) {

            alert(
                "Please add at least 2 players to create a tournament."
            );

            return;

        }


        const tournament = {

            name: tournamentName,

            type: tournamentType,

            players: players,

            playerCount: players.length,

            createdAt: new Date().toISOString()

        };


        localStorage.setItem(
            "currentTournament",
            JSON.stringify(tournament)
        );


        window.location.href = "tournament.html";

    });


    updatePlayerCount();

});