// TODO @darzu: use Fetch (https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
function getFileInternal(url, respType, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    if (respType)
        xhr.responseType = respType;
    xhr.onload = function () {
        var status = xhr.status;
        if (status === 200) {
            callback(null, xhr);
        }
        else {
            callback(status, xhr);
        }
    };
    xhr.send();
}
function getFile(url, respType) {
    return new Promise((resolve, reject) => {
        getFileInternal(url, respType, (status, result) => {
            let resp = respType === "document" ? result.responseXML : result.response;
            if (!status || status === 200) {
                resolve(resp);
            }
            else {
                reject(status);
            }
        });
    });
}
export function getJson(url) {
    return getFile(url, "json");
}
export function getText(url) {
    return getFile(url, "text");
}
export function getBytes(url) {
    return getFile(url, "arraybuffer");
}
export function getXml(url) {
    return getFile(url, "document").then((xmlResp) => xmlResp.documentElement);
}
//# sourceMappingURL=webget.js.map