cat << EOF >> /var/lib/postgresql/data/postgresql.conf
port = 5432
ssl = off
max_wal_senders = 1
max_replication_slots = 10
wal_level = logical
shared_preload_libraries = wal2json
EOF

cat << EOF >> /var/lib/postgresql/data/pg_hba.conf
# TYPE  DATABASE        USER            ADDRESS                 METHOD

# "local" is for Unix domain socket connections only
local   all             all                                     trust
# IPv4 local connections:
host    all             all             127.0.0.1/32            trust
# IPv6 local connections:
host    all             all             ::1/128                 trust
# Allow replication connections from localhost, by a user with the
# replication privilege.
local   replication     all                                     trust
host    replication     all             127.0.0.1/32            trust
host    replication     all             ::1/128                 trust

host all all all md5
EOF
