import { loadFeatures, runFeatures } from "@/feats";
import "./self-test.steps";

const features = await loadFeatures("tests/features/*.feature");
runFeatures(features);
