import core from "@actions/core";
import fs from "fs";

async function getIDTokenAction() {
   const id_token = await core.getIDToken("sts.amazonaws.com");
   return id_token;
}
let idToken = await getIDTokenAction();

fs.writeFile("integ_token.txt", idToken, (err) => {
  if (err) throw err;
});