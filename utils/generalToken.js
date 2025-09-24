const jwt = require('jsonwebtoken')
const dotenv = require('dotenv');
dotenv.config()
const genneralAccessToken = (payload) => {
    const access_token = jwt.sign({
        ...payload
    }, process.env.ACCESS_TOKEN, { expiresIn: process.env.JWT_EXPIRYHOUR })

    return access_token
}

const genneralRefreshToken = (payload) => {
    const refresh_token = jwt.sign({
        ...payload
    }, process.env.REFRESH_TOKEN, { expiresIn: process.env.JWT_EXPIRYDAY })

    return refresh_token
}


module.exports = {
    genneralAccessToken,
    genneralRefreshToken,
}