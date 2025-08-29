import core from "@actions/core";
import fs from "fs/promises";

async function getIDTokenAction() {
   const id_token = await core.getIDToken("sts.amazonaws.com");
   return id_token;
}
let idToken = await getIDTokenAction();

await fs.writeFile(".github/integ_tests/integ_token.txt", idToken, (err) => {
  if (err) throw err;
});
