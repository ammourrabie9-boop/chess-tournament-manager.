document.addEventListener("DOMContentLoaded", function () {

    /* ================================
       GET SAVED TOURNAMENT
    ================================= */

    const savedTournament =
        localStorage.getItem("currentTournament");


    if (!savedTournament) {

        alert("No tournament found.");

        window.location.href = "dashboard.html";

        return;

    }


    const tournament =
        JSON.parse(savedTournament);



    /* ================================
       GET ELEMENTS
    ================================= */

    const tournamentTitle =
        document.getElementById("tournamentTitle");

    const tournamentType =
        document.getElementById("tournamentType");

    const infoType =
        document.getElementById("infoType");

    const infoPlayers =
        document.getElementById("infoPlayers");

    const tournamentPlayersList =
        document.getElementById("tournamentPlayersList");



    /* ================================
       TOURNAMENT TYPE NAMES
    ================================= */

    const tournamentTypeNames = {

        swiss: "Swiss System",

        "round-robin": "Round Robin",

        "double-round-robin": "Double Round Robin",

        knockout: "Knockout",

        "double-elimination": "Double Elimination",

        team: "Team Tournament",

        "team-swiss": "Team Swiss",

        "team-round-robin": "Team Round Robin",

        match: "Match",

        scheveningen: "Scheveningen",

        "double-swiss": "Double-Swiss",

        "accelerated-swiss": "Accelerated Swiss",

        dutch: "FIDE Dutch System",

        dubov: "Dubov System",

        burstein: "Burstein System",

        lim: "Lim System",

        hybrid: "Hybrid / Multi-Stage",

        custom: "Custom Tournament"

    };



    /* ================================
       DISPLAY TOURNAMENT INFORMATION
    ================================= */

    tournamentTitle.textContent =
        tournament.name;


    const readableType =
        tournamentTypeNames[tournament.type]
        || tournament.type;


    tournamentType.textContent =
        readableType;


    infoType.textContent =
        readableType;


    infoPlayers.textContent =
        tournament.players.length;



    /* ================================
       DISPLAY PLAYERS
    ================================= */

    function displayPlayers() {

        tournamentPlayersList.innerHTML = "";


        tournament.players.forEach(function (player, index) {

            const playerRow =
                document.createElement("div");


            playerRow.className =
                "player-row";


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


            tournamentPlayersList.appendChild(playerRow);

        });

    }



    /* ================================
       BACK BUTTON
    ================================= */

    const backButton =
        document.getElementById("backButton");


    if (backButton) {

        backButton.addEventListener("click", function () {

            window.location.href =
                "dashboard.html";

        });

    }



    /* ================================
       INITIAL DISPLAY
    ================================= */

    displayPlayers();

});