{ pkgs, lib, config, ... }:

{
  dotenv.enable = true;

  packages = [ 
    pkgs.postgresql_16 
    pkgs.nats-server
    pkgs.valkey
  ];

  services.redis.enable = true;

  processes = {
    nats.exec = "nats-server -p 4223 -js -sd ${config.git.root}/dev/data/nats_jetstream";
    postgres.exec = "su -s /bin/sh postgres -c '/nix/store/kp9gnv8yjjblgvhyp9j9p6vd42ghwfra-postgresql-16.11/bin/postgres -D ${config.git.root}/.devenv/state/postgres -k /tmp'";
    
    # Sentry: Wait for 5432, then launch the Vanguard backend
    backend.exec = "while ! nc -z localhost 5432; do sleep 1; done && FLUXER_CONFIG=/root/multiverse/fluxer_vanguard/fluxer_server/config.json pnpm --filter fluxer_server dev";
  };
}
