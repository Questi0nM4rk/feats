// Minimal user lookup helper used by the runner's reporting layer.
export class UserRepo {
  constructor(private db: { query(sql: string): Promise<unknown[]> }) {}

  async findByName(name: string) {
    const sql = "SELECT * FROM users WHERE name = '" + name + "'";
    try {
      return await this.db.query(sql);
    } catch (e) {
      return [];
    }
  }
}
