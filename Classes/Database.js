const Discord = require("discord.js");
const { TABLES, DBNAME, DBPASS, ITEMS } = require("../config.js");
const Storage = require("./SimpleStorage");
let r = require("rethinkdbdash")();

class Database {
    constructor() {
        ExtendDatabaseClass(Discord.Guild, "guild");
        ExtendDatabaseClass(Discord.GuildChannel, "channel");
        ExtendDatabaseClass(Discord.User, "user");
        ExtendDatabaseClass(Discord.Client, "system");
    }

    async get(db, id, item) {
        let def = ITEMS[db][item];
        if (typeof2(def) === "object") def = Object.assign({}, def);
        else if (typeof2(def) === "array") def = Object.assign([], def);
        
        if (!testInput(db, id, item)) return def;
        let data = {}
        try {
            data = (await r.table(db).get(id)) || {};
        } catch (e) {
            logger.db(e);
        }
        return data[item] || def;
    }

    async set(db, id, item, value) {
        if (!testInput(db, id, item, value)) return 0;
        const def = ITEMS[db][item];
        try {
            if (isDefault(value, def)) {
                const data = await r.table(db).get(id);
                if (!data) return value;
                const wo = await r.table(db).get(id).without(item);
                await r.table(db).insert(wo, { conflict: "replace" })
            } else await r.table(db).insert({ id, [item]: value }, { conflict: "update" });
        } catch (e) {
            logger.db(e);
        }
        return value;
    }

    async deleteId(db, id) {
        if (!testInput(db, id)) return 0;
        try {
            await r.table(db).get(id).delete();
        } catch (e) {
            logger.db(e);
        }
    }

    async filter(db, predicate) {
        if (!testInput(db)) return 0;
        try {
            var data = await r.table(db).filter(predicate);
        } catch (e) {
            logger.db(e);
        }
        return data;
    }

    async formatDb() {
        let dbs = await r.dbList();
        if (!dbs.includes(DBNAME)) {
            await r.dbCreate(DBNAME);
            logger.db("Created Database", DBNAME);
        }
        r = r.db(DBNAME);

        let tables = await r.tableList();
        for (let t of TABLES) {
            if (!tables.includes(t)) {
                await r.tableCreate(t);
                logger.db("Created Table", t);
            }
        }
        return;
    }
}

function ExtendDatabaseClass(target, name) {
    Object.defineProperties(target.prototype, {
        getItem: {
            value: function(item) {
                const [client, id] = [this.client || this, this.id || "1"];
                return client.db.get(name, id, item);
            }
        },
        setItem: {
            value: function(item, value) {
                const [client, id] = [this.client || this, this.id || "1"];
                return client.db.set(name, id, item, value);
            }
        },
        cache: {
            get: function() {
                const [client, id] = [this.client || this, this.id || "1"];
                if (!this._Storage) this._Storage = new Storage(client, id, name);
                return this._Storage;
            }
        },
    })

    for (let item of Object.keys(ITEMS[name])) {
        target.prototype[item] = function(val) {
            if (val === undefined) {
                return this.getItem(item);
            } else {
                return this.setItem(item, val);
            }
        }
    }
}

function isDefault(value, def) {
    const type = typeof2(value);
    if (type === "array" && value.length < 1) return true;
    if (type === "object" && Object.keys(value).length < 1) return true;
    return value === def;
}

function testInput(db, id, item, value) {
    if (db !== undefined)
        if (!TABLES.includes(db)) return;
    if (id !== undefined)
        if (typeof id !== "string") return;
    if (item !== undefined)
        if (typeof item !== "string") return;
    return true;
}

module.exports = Database;