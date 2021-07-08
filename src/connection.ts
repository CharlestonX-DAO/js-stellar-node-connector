import BigNumber from "bignumber.js";
import * as crypto from "crypto";
const StellarBase = require('stellar-base');
import * as sodium from 'sodium-native'
import {PeerNode} from "./peer-node";
import {Keypair, xdr} from "stellar-base";
import {err, ok, Result} from "neverthrow";
import {Socket} from 'net';
import {ConnectionAuthentication} from "./connection-authentication";

export class Connection { //todo: introduce 'fromNode'
    _keyPair: any; //StellarBase.Keypair;
    _toNode: PeerNode;
    _remotePublicKey?: Buffer;
    _localNonce: Buffer;
    _remoteNonce?: Buffer;
    _localSequence: any;//StellarBase.xdr.Uint64;
    _remoteSequence: any; //StellarBase.xdr.Uint64;
    handshakeCompleted: boolean = false;
    socket: Socket;
    connectionAuthentication: ConnectionAuthentication;

    constructor(keyPair: Keypair, toNode: PeerNode, socket: Socket, connectionAuth: ConnectionAuthentication) {
        this.socket = socket;
        this.connectionAuthentication = connectionAuth;
        this._keyPair = keyPair;
        this._localNonce = StellarBase.hash(BigNumber.random().toString());
        this._localSequence = StellarBase.xdr.Uint64.fromString("0");
        //this._remoteSequence = StellarBase.xdr.Uint64.fromString("0");
        this._toNode = toNode;
    }

    get keyPair(): any /*StellarBase.Keypair*/ {
        return this._keyPair;
    }

    get toNode(): PeerNode {
        return this._toNode;
    }

    get localNonce(): Buffer {
        return this._localNonce;
    }

    set localNonce(value: Buffer) {
        this._localNonce = value;
    }

    get localSequence(): any /*StellarBase.xdr.Uint64*/ {
        return this._localSequence;
    }

    get remoteSequence() {
        return this._remoteSequence;
    }

    set remoteSequence(value: any /*StellarBase.xdr.Uint64*/) {
        this._remoteSequence = value;
    }

    get remotePublicKey(): Buffer | undefined {
        return this._remotePublicKey;
    }

    set remotePublicKey(value: Buffer | undefined) {
        this._remotePublicKey = value;
    }

    get remoteNonce(): Buffer | undefined {
        return this._remoteNonce;
    }

    set remoteNonce(value: Buffer | undefined) {
        this._remoteNonce = value;
    }

    increaseLocalSequenceByOne() {
        let seq = new BigNumber(this._localSequence).plus(1);
        this._localSequence = StellarBase.xdr.Uint64.fromString(seq.toString());
    }

    getSendingMacKey () {
        let buf = Buffer.concat([
            Buffer.from([0]), //uint8_t = 1 char = 1 byte
            this.localNonce,
            this.remoteNonce!,
            Buffer.from([1])
        ]);

        let sharedKey = this.connectionAuthentication.getSharedKey(this._remotePublicKey!);

        return crypto.createHmac('SHA256', sharedKey).update(buf).digest();
    }

    authenticateMessage(message: xdr.StellarMessage): Result<xdr.AuthenticatedMessage, Error>{
        try {
            let xdrAuthenticatedMessageV1 = new StellarBase.xdr.AuthenticatedMessageV0({
                sequence: this.localSequence,
                message: message,
                mac: this.getMacForAuthenticatedMessage(message)
            });

            let authenticatedMessage = new StellarBase.xdr.AuthenticatedMessage(0);
            authenticatedMessage.set(0, xdrAuthenticatedMessageV1);

            return ok(authenticatedMessage);
        }catch (error) {
            return err(error);
        }
    }

    getMacForAuthenticatedMessage(message: any /*StellarBase.xdr.StellarMessage*/) {
        if(!this.remotePublicKey){
            return new StellarBase.xdr.HmacSha256Mac({
                mac: Buffer.alloc(32) // empty mac for hello message
            })
        }

        let sendingMacKey = this.getSendingMacKey();
        let sendingMac =
            crypto.createHmac('SHA256', sendingMacKey).update(
                Buffer.concat([
                    this.localSequence.toXDR(),
                    message.toXDR()
                ])
            ).digest();

        return new StellarBase.xdr.HmacSha256Mac({
            mac: sendingMac
        });
    }

    processHelloMessage(hello: xdr.Hello){
        this.remoteNonce = hello.nonce();
        this.remotePublicKey = hello.cert().pubkey().key();
        this.toNode.updateFromHelloMessage(hello);
    }
}