const fs = require('fs');

module.exports = function () {
    const proxyList = [];
    const path = "./proxy/";

    return new Promise(function (resolve) {
        fs.readdir(path, (err, files) => {
            if (err) {
                console.error("Error reading proxy directory:", err);
                return resolve([]);
            }

            if (files && files.length > 0) {
                let pendingFiles = files.length;
                files.forEach((fileName) => {
                    fs.readFile(`${path}${fileName}`, 'utf8', (error, data) => {
                        if (!error) {
                            proxyList.push(...data.toString().split("\n"));
                        }
                        if (--pendingFiles === 0) {
                            resolve(proxyList);
                        }
                    });
                });
            } else {
                resolve([]);
            }
        });
    });
};
