import type { BunPlugin } from "bun";
import { parseFeature } from "@/parser/adapter";

const featsPlugin: BunPlugin = {
  name: "feats-gherkin",
  setup(build) {
    build.onLoad({ filter: /\.feature$/ }, async (args) => {
      const source = await Bun.file(args.path).text();
      const feature = parseFeature(source, args.path);
      return {
        contents: `export default ${JSON.stringify(feature)};`,
        loader: "js",
      };
    });
  },
};

export default featsPlugin;
