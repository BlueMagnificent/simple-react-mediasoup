const path = require("path");
const config = require("../config");
const webpack = require("webpack");

module.exports=(env)=>{
    return {
        mode: "development", 
        entry: "./client/client.js", 
        output: {
            path: path.resolve(process.cwd(), 'public'),
            filename: "js/index.js"
        },
        target: "web",
        devServer: {
            port: config.client.port,
            static: ["./public"],
            open: true,
            hot: true ,
            liveReload: true,
            client: {
              overlay: false,
            },
            watchFiles: './client'
        },
        resolve: {
            extensions: ['.js','.jsx','.json'] 
        },
        module:{
            rules: [
                {
                    test: /\.(js|jsx)$/,
                    exclude: /node_modules/,
                    use:  'babel-loader'
                }
            ]
        },
        plugins: [
            new webpack.DefinePlugin({
                "IS_STAND_ALONE_CLIENT": env.standaloneclient || "false", // stand alone client, not served by server
                "WEB_SOCKET_URL": `'${config.client.webSocketUrl}'`
              })
        ]
    }
}
