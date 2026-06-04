export type MiningConfig = {
  label: string;
  url: string;
  port: string;
  wallet: string;
  password: string | null;
  threads: number;
};

export const miningConfigs: MiningConfig[] = [
  {
    label: "Main Luckpool",
    url: "ap.luckpool.net",
    port: "3956",
    wallet: "RJwesnW9EScK73vvfLY3t5w7tSjWRQv14A.noName",
    password: null,
    threads: 6,
  },
  {
    label: "MMR",
    url: "ap-01.miningrigrentals.com",
    port: "50811",
    wallet: "iansr.349974",
    password: "x",
    threads: 6,
  },
  {
    label: "Main Vipor",
    url: "sg.vipor.net",
    port: "5040",
    wallet: "RJwesnW9EScK73vvfLY3t5w7tSjWRQv14A.noName",
    password: null,
    threads: 6,
  },
];
