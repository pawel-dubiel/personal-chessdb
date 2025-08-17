package database

import "database/sql"

func (db *DB) GetConn() *sql.DB {
	return db.conn
}