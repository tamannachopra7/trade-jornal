import { Client, Databases, ID } from 'node-appwrite';

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);

const DATABASE_ID = 'trade_journal';

const collections = [
    {
        id: 'accounts',
        name: 'Accounts',
        attributes: [
            { key: 'name', type: 'string', required: true, size: 255 },
            { key: 'broker', type: 'string', required: false, size: 255, default: '' },
            { key: 'kind', type: 'string', required: true, size: 50 },
            { key: 'currency', type: 'string', required: true, size: 10, default: 'USD' },
            { key: 'initialBalance', type: 'float', required: true, default: 0 },
            { key: 'profitCalcMethod', type: 'string', required: true, size: 20, default: 'fifo' },
            { key: 'credentialsEnc', type: 'string', required: false, size: 1000 },
            { key: 'autoSync', type: 'boolean', required: true, default: false },
            { key: 'lastSyncAt', type: 'string', required: false, size: 100 },
            { key: 'snapshotJson', type: 'string', required: false, size: 10000 },
            { key: 'archivedAt', type: 'string', required: false, size: 100 },
            { key: 'createdAt', type: 'string', required: true, size: 100 }
        ]
    },
    {
        id: 'executions',
        name: 'Executions',
        attributes: [
            { key: 'accountId', type: 'string', required: true, size: 100 },
            { key: 'symbol', type: 'string', required: true, size: 100 },
            { key: 'side', type: 'string', required: true, size: 10 },
            { key: 'quantity', type: 'float', required: true },
            { key: 'price', type: 'float', required: true },
            { key: 'fee', type: 'float', required: true, default: 0 },
            { key: 'executedAt', type: 'string', required: true, size: 100 },
            { key: 'assetClass', type: 'string', required: false, size: 50 },
            { key: 'source', type: 'string', required: true, size: 50 },
            { key: 'importMetadataJson', type: 'string', required: false, size: 10000 },
            { key: 'contentHash', type: 'string', required: true, size: 255 },
            { key: 'createdAt', type: 'string', required: true, size: 100 }
        ]
    },
    {
        id: 'trades',
        name: 'Trades',
        attributes: [
            { key: 'accountId', type: 'string', required: true, size: 100 },
            { key: 'symbol', type: 'string', required: true, size: 100 },
            { key: 'assetClass', type: 'string', required: false, size: 50 },
            { key: 'direction', type: 'string', required: true, size: 10 },
            { key: 'status', type: 'string', required: true, size: 20 },
            { key: 'openedAt', type: 'string', required: true, size: 100 },
            { key: 'closedAt', type: 'string', required: false, size: 100 },
            { key: 'quantity', type: 'float', required: true },
            { key: 'openQuantity', type: 'float', required: true },
            { key: 'avgEntry', type: 'float', required: true },
            { key: 'avgExit', type: 'float', required: false },
            { key: 'grossPnl', type: 'float', required: true },
            { key: 'fees', type: 'float', required: true },
            { key: 'netPnl', type: 'float', required: true },
            { key: 'executionCount', type: 'integer', required: true },
            { key: 'executionIdsJson', type: 'string', required: true, size: 10000 },
            { key: 'exitsJson', type: 'string', required: true, size: 10000 },
            { key: 'durationMs', type: 'integer', required: false },
            { key: 'notes', type: 'string', required: false, size: 10000 },
            { key: 'tagsJson', type: 'string', required: false, size: 1000 },
            { key: 'mistakesJson', type: 'string', required: false, size: 1000 },
            { key: 'playbookId', type: 'string', required: false, size: 100 },
            { key: 'rating', type: 'integer', required: false },
            { key: 'stopLoss', type: 'float', required: false },
            { key: 'profitTarget', type: 'float', required: false },
            { key: 'reviewedAt', type: 'string', required: false, size: 100 }
        ]
    },
    {
        id: 'playbooks',
        name: 'Playbooks',
        attributes: [
            { key: 'name', type: 'string', required: true, size: 255 },
            { key: 'description', type: 'string', required: false, size: 1000 },
            { key: 'rulesJson', type: 'string', required: false, size: 10000 }
        ]
    },
    {
        id: 'progressRules',
        name: 'Progress Rules',
        attributes: [
            { key: 'title', type: 'string', required: true, size: 255 },
            { key: 'stage', type: 'string', required: true, size: 50 },
            { key: 'weekdaysJson', type: 'string', required: true, size: 1000 },
            { key: 'createdAt', type: 'string', required: true, size: 100 },
            { key: 'archivedAt', type: 'string', required: false, size: 100 }
        ]
    },
    {
        id: 'progressChecks',
        name: 'Progress Checks',
        attributes: [
            { key: 'ruleId', type: 'string', required: true, size: 100 },
            { key: 'date', type: 'string', required: true, size: 50 },
            { key: 'done', type: 'boolean', required: true }
        ]
    },
    {
        id: 'missedTrades',
        name: 'Missed Trades',
        attributes: [
            { key: 'symbol', type: 'string', required: true, size: 100 },
            { key: 'direction', type: 'string', required: true, size: 10 },
            { key: 'observedAt', type: 'string', required: true, size: 100 },
            { key: 'playbookId', type: 'string', required: false, size: 100 },
            { key: 'entry', type: 'float', required: false },
            { key: 'stop', type: 'float', required: false },
            { key: 'target', type: 'float', required: false },
            { key: 'notes', type: 'string', required: false, size: 10000 },
            { key: 'createdAt', type: 'string', required: true, size: 100 },
            { key: 'archivedAt', type: 'string', required: false, size: 100 }
        ]
    },
    {
        id: 'noteTemplates',
        name: 'Note Templates',
        attributes: [
            { key: 'name', type: 'string', required: true, size: 255 },
            { key: 'content', type: 'string', required: true, size: 100000 }
        ]
    },
    {
        id: 'journalNotes',
        name: 'Journal Notes',
        attributes: [
            { key: 'date', type: 'string', required: true, size: 50 },
            { key: 'content', type: 'string', required: true, size: 100000 }
        ]
    },
    {
        id: 'settings',
        name: 'Settings',
        attributes: [
            { key: 'value', type: 'string', required: true, size: 100000 }
        ]
    },
    {
        id: 'propAccounts',
        name: 'Prop Accounts',
        attributes: [
            { key: 'firm', type: 'string', required: true, size: 255 },
            { key: 'name', type: 'string', required: true, size: 255 },
            { key: 'program', type: 'string', required: true, size: 100 },
            { key: 'status', type: 'string', required: true, size: 50 },
            { key: 'currency', type: 'string', required: true, size: 10 },
            { key: 'sizeMinor', type: 'integer', required: false },
            { key: 'parentId', type: 'string', required: false, size: 100 },
            { key: 'journalAccountId', type: 'string', required: false, size: 100 },
            { key: 'openedOn', type: 'string', required: true, size: 100 },
            { key: 'closedOn', type: 'string', required: false, size: 100 },
            { key: 'renewalOn', type: 'string', required: false, size: 100 },
            { key: 'renewalMinor', type: 'integer', required: false },
            { key: 'notes', type: 'string', required: false, size: 10000 },
            { key: 'archived', type: 'boolean', required: false, default: false },
            { key: 'revision', type: 'integer', required: false, default: 1 },
            { key: 'createdAt', type: 'string', required: true, size: 100 },
            { key: 'updatedAt', type: 'string', required: true, size: 100 }
        ]
    },
    {
        id: 'propEntries',
        name: 'Prop Entries',
        attributes: [
            { key: 'accountId', type: 'string', required: false, size: 100 },
            { key: 'firm', type: 'string', required: true, size: 255 },
            { key: 'kind', type: 'string', required: true, size: 50 },
            { key: 'currency', type: 'string', required: true, size: 10 },
            { key: 'amountMinor', type: 'integer', required: true },
            { key: 'splitBps', type: 'integer', required: true },
            { key: 'feeMinor', type: 'integer', required: true },
            { key: 'category', type: 'string', required: true, size: 100 },
            { key: 'occurredOn', type: 'string', required: true, size: 100 },
            { key: 'dueOn', type: 'string', required: false, size: 100 },
            { key: 'status', type: 'string', required: true, size: 50 },
            { key: 'parentId', type: 'string', required: false, size: 100 },
            { key: 'reference', type: 'string', required: false, size: 1000 },
            { key: 'notes', type: 'string', required: false, size: 10000 },
            { key: 'voided', type: 'boolean', required: false, default: false },
            { key: 'revision', type: 'integer', required: false, default: 1 },
            { key: 'createdAt', type: 'string', required: true, size: 100 },
            { key: 'updatedAt', type: 'string', required: true, size: 100 }
        ]
    },
    {
        id: 'propReceipts',
        name: 'Prop Receipts',
        attributes: [
            { key: 'payoutId', type: 'string', required: true, size: 100 },
            { key: 'kind', type: 'string', required: true, size: 50 },
            { key: 'amountMinor', type: 'integer', required: true },
            { key: 'occurredOn', type: 'string', required: true, size: 100 },
            { key: 'reference', type: 'string', required: false, size: 1000 },
            { key: 'notes', type: 'string', required: false, size: 10000 },
            { key: 'voided', type: 'boolean', required: false, default: false },
            { key: 'createdAt', type: 'string', required: true, size: 100 }
        ]
    },
    {
        id: 'propAudit',
        name: 'Prop Audit',
        attributes: [
            { key: 'id', type: 'string', required: true, size: 100 },
            { key: 'entityType', type: 'string', required: true, size: 50 },
            { key: 'entityId', type: 'string', required: true, size: 100 },
            { key: 'beforeJson', type: 'string', required: false, size: 8000 },
            { key: 'afterJson', type: 'string', required: true, size: 8000 },
            { key: 'reason', type: 'string', required: true, size: 1000 },
            { key: 'createdAt', type: 'string', required: true, size: 100 }
        ]
    }
];

async function setup() {
    try {
        console.log(`Creating database ${DATABASE_ID}...`);
        await databases.create(DATABASE_ID, 'Trade Journal Database');
        console.log(`Database created.`);
    } catch (err) {
        if (err.code === 409 || err.code === 403) {
            console.log(`Database already exists or limit reached (assuming it exists).`);
        } else {
            throw err;
        }
    }

    for (const col of collections) {
        try {
            console.log(`Creating collection ${col.id}...`);
            await databases.createCollection(DATABASE_ID, col.id, col.name);
            console.log(`Created collection ${col.id}. Adding attributes...`);
            
            for (const attr of col.attributes) {
                try {
                    if (attr.type === 'string') {
                        await databases.createStringAttribute(DATABASE_ID, col.id, attr.key, attr.size || 255, attr.required, attr.default);
                    } else if (attr.type === 'float') {
                        await databases.createFloatAttribute(DATABASE_ID, col.id, attr.key, attr.required, undefined, undefined, attr.default);
                    } else if (attr.type === 'integer') {
                        await databases.createIntegerAttribute(DATABASE_ID, col.id, attr.key, attr.required, undefined, undefined, attr.default);
                    } else if (attr.type === 'boolean') {
                        await databases.createBooleanAttribute(DATABASE_ID, col.id, attr.key, attr.required, attr.default);
                    }
                } catch (e) {
                    if (e.code === 409) {
                        console.log(`Attribute ${attr.key} already exists.`);
                    } else {
                        console.error(`Error creating attribute ${attr.key}:`, e.message);
                    }
                }
            }
        } catch (err) {
            if (err.code === 409) {
                console.log(`Collection ${col.id} already exists.`);
            } else {
                console.error(`Error creating collection ${col.id}:`, err.message);
            }
        }
    }
    
    console.log("Setup complete!");
}

setup();
