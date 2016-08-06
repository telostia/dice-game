import { GAME_STATE_SETUP, GAME_STATE_WAITING, GAME_STATE_READY, GAME_STATE_IN_PROGRESS } from './constants';
import { SetupState, WaitingState, ReadyState, InProgressState } from './game-states';
import GameState from './game-state';
import Player from './player';
import * as actions from './actions';


export interface GameData {
    round: number;
    numberOfDice: number;
    score: {
        [playerId: number]: number[]
    };
}

export interface GameRoomOptions {
    maxPlayers: number;
}

/**
 * Responsible for keeping track of the players and relaying incoming messages to active game state
 */
export default class GameRoom {

    public maxPlayers: number;
    public players: Player[];
    public states: {
        [stateName: string]: GameState
    };
    public gameData: GameData;
    public state: GameState;
    public stateName: string;

    constructor(options: GameRoomOptions) {
        this.maxPlayers = options.maxPlayers;
        this.players = [];
        this.states = {
            [GAME_STATE_SETUP]: new SetupState(this),
            [GAME_STATE_WAITING]: new WaitingState(this),
            [GAME_STATE_READY]: new ReadyState(this),
            [GAME_STATE_IN_PROGRESS]: new InProgressState(this)
        };
        this.gameData = {
            round: 0,
            numberOfDice: 4,
            score: { }
        };
        this.state = null;
        this.stateName = '';
        this.setState(GAME_STATE_SETUP);
    }

    setState(stateName: string) {
        const newState: GameState = this.states[stateName];
        if (this.state === newState) {
            return;
        }
        
        if (newState) {
            this.stateName = stateName;
            this.state = newState;

            actions.gameStateChanged(this, stateName);
            this.state.enterState();
        }
    }

    setGameData(gameData: GameData) {
        this.gameData = gameData;
        actions.gameDataChanged(this, gameData);
    }

    /**
     * @throws {Error} Will throw an error on attempts to add a new player when the room is full
     */
    addPlayer(player: Player) {
        if (!this.hasAvailableSlots) {
            throw new Error('The room is full');
        }

        player.room = this;
        this.players.push(player);
        
        actions.playerJoined(this, player);
        this.state.playerJoined(player);
    }

    removePlayer(player: Player) {
        const index = this.players.indexOf(player);
        if (index >= 0) {
            player.room = null;
            this.players.splice(index, 1);
            actions.playerLeft(this, player);
            this.state.playerLeft(player);
        }
    }

    /**
     * Parse a message coming from the client
     * @return {Object|null}
     */
    parseMessage(message: string): any {
        try {
            return JSON.parse(message);
        } catch (err) {
            return null;
        }
    }

    processMessage(message: string, sender: Player) {
        const parsedMessage = this.parseMessage(message);

        if (parsedMessage) {
            this.state.processMessage(parsedMessage, sender);
        }
    }

    /**
     * Send message to all players in the room
     * @param {Player} [exclude] - this player will be skipped
     */
    broadcast(message: any, exclude?: Player) {
        const json = JSON.stringify(message);
        this.players.forEach(
            (player) => player !== exclude && player.ws.send(json)
        );
    }

    /**
     * Serialize the full game state
     * @return {Object}
     */
    serialize() {
        return {
            stateName: this.stateName,
            gameData: this.gameData,
            players: this.players.map(
                (player) => player.serialize()
            )
        };
    }

    /**
     * Checks if a new player can be added to the room
     * @return {Boolean}
     */
    get hasAvailableSlots() {
        return this.playerCount < this.maxPlayers;
    }

    /**
     * @return {Number}
     */
    get playerCount() {
        return this.players.length;
    }

};