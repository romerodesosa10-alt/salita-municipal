import { MongoClient } from 'mongodb';

export async function openMongoStore(uri, database) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const collection = client.db(database).collection('salita_state');
    const key = { _id: 'main' };
    const saved = await collection.findOne(key);
    let revision = saved?.revision;

    return {
      data: saved?.data,
      async save(data) {
        if (revision === undefined) {
          await collection.insertOne({ ...key, revision: 0, data });
          revision = 0;
          return;
        }
        const result = await collection.replaceOne(
          { ...key, revision },
          { ...key, revision: revision + 1, data },
        );
        if (result.matchedCount !== 1) {
          throw Object.assign(new Error('La base fue modificada por otro proceso. Reiniciá esta instancia.'), { status: 503 });
        }
        revision++;
      },
    };
  } catch (error) {
    await client.close();
    throw error;
  }
}
