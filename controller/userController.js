const User = require('../models/userModel')
const Products = require('../models/productModel')
const Addresses = require('../models/addressModel')
const { getOTP, securePassword } = require('../helpers/generator')
const { sendVerifyMail } = require('../services/nodeMailer')
const crypto = require('crypto')
const bcrypt = require('bcrypt')






const loadHome = async (req, res, next) => {
    try {
        const isLoggedIn = Boolean(req.session.userId)

        res.render('home', { page: 'Home', isLoggedIn })
    } catch (error) {
        next(error);
    }
}


const loadLogin = async (req, res, next) => {
    try {
        res.render('login')
    } catch (error) {
        next(error);
    }
}

const logoutUser = async (req, res, next) => {
    try {
        req.session.destroy()
        res.redirect('/')
    } catch (error) {
        next(error)
    }
}

const postLogin = async (req, res, next) => {
    try {
        const { email, password } = req.body
        const userData = await User.findOne({ email })

        if (userData) {
            const passwordMatch = await bcrypt.compare(password, userData.password)

            if (passwordMatch) {

                if (!userData.isBlocked) {
                    req.session.userId = userData._id
                    req.session.cartCount = userData.cart.length
                    req.session.wishCount = userData.wishlist.length
                    res.redirect('/')

                    res.render("login", { isLoggedIn: true });
                } else {
                    res.render('login', { message: 'Sorry you are blocked by the admin' })
                    return;
                }
            } else {
                res.render('login', { message: 'Invalid Password' })
            }
        } else {
            res.render('login', { message: 'User does not exist' })
        }
    } catch (error) {
        next(error)
    }
}

const loadRegister = async (req, res, next) => {
    try {
        res.render('register')
    } catch (error) {
        next
        next(error);
    }
}


// post signup

const postRegister = async (req, res, next) => {
    try {
        const { fname, lname, email, mobile, password, confirmPassword } = req.body
        // res.json({fname, lname, email , mobile, password, confirmPassword})
        if (password === confirmPassword) {

            const userData = await User.findOne({ email })
            if (userData) {
                console.log("User Already Exists");
                return res.render('register', { message: 'User Already Exists' })
            }

            const OTP = req.session.OTP = getOTP()
            // req.session.save()
            // req.session.fname=fname
            // req.session.lname=lname
            // req.session.email=email
            // req.session.mobile=mobile
            // req.session.password=password

            console.log(OTP);

            sendVerifyMail(email, OTP)

            setTimeout(() => {
                req.session.OTP = null    //Or delete req.session.otp
                console.log('OTP time out');
            }, 600000);

            res.render('otpValidation', { fname, lname, email, mobile, password, message: 'Check Spam Mails' })

        } else {
            // console.log("Password Not Matching");
            req.app.locals.message = 'Passwords do not match';
            res.redirect('/register')
        }

    } catch (error) {
        next(error);
    }
}

const validateOTP = async (req, res, next) => {

    try {
        const { fname, lname, email, mobile, password } = req.body

        const userOTP = req.body.OTP


        if (userOTP == req.session.OTP) {
            const spassword = await securePassword(password)


            let newUserData;

            newUserData = await new User({
                fname, lname, email, mobile,
                password: spassword
            }).save();

            req.session.userId = newUserData._id;

            res.redirect('/')

        } else {
            console.log('Incorrect OTP');
            res.render('otpValidation', { fname, lname, email, mobile, password, message: 'Incorrect OTP' })
        }
    } catch (error) {
        next(error);
    }
}

const resendOTP = async (req, res, next) => {
    try {
        console.log('in resend otp controller');
        const { email } = req.body
        const OTP = req.session.OTP = getOTP()
        console.log('resending otp ' + OTP + ' to ' + email);
        setTimeout(() => {
            req.session.OTP = null;   //Or delete req.session.otp;
            console.log('otp time out');
        }, 600000);
        sendVerifyMail(email, OTP);
        res.json({ isResend: true })

    } catch (error) {
        console.log(error)
    }
}

const loadShoppingCart = async (req, res, next) => {
    try {
        const userId = req.session.userId;
        // console.log('userId:'+userId);
        const userData = await User.findById({ _id: userId }).populate('cart.productId')
        const cartItems = userData.cart

        //Code to update cart values if product price changed by admin after we added pdt into cart
        for (const { productId } of cartItems) {
            await User.updateOne(
                { _id: userId, 'cart.productId': productId._id },
                {
                    $set: {
                        'cart.$.productPrice': productId.price,
                        'cart.$.discountPrice': productId.discoutPrice,
                    }
                }
            )
        }

        res.render('shoppingCart', { page: 'Shopping Cart', parentPage: 'Shop', isLoggedIn: true, userData, cartItems })
    } catch (error) {
        console.log(error.message);
    }
}



const addToCart = async (req, res, next) => {
    try {
        const pdtId = req.params.id;
        const userId = req.session.userId;

        const userData = await User.findById({ _id: userId })
        const pdtData = await Products.findById({ _id: pdtId })

        if (pdtData.quantity) {

            const isProductExist = userData.cart.findIndex((pdt) => pdt.productId == pdtId)
            if (isProductExist === -1) {


                const cartItem = {
                    productId: pdtId,
                    quantity: 1,
                    productPrice: pdtData.price,
                    discountPrice: pdtData.discountPrice
                }

                await User.findByIdAndUpdate(
                    { _id: userId },
                    {
                        $push: {
                            cart: cartItem
                        }
                    }
                )

                req.session.cartCount++
                //cartCount
                let userDataForCount = await User.findOne({ _id: userId })
                req.session.cartCount = userDataForCount.cart.length
            } else {

                await User.updateOne(
                    { _id: userId, 'cart.productId': pdtId },
                    {
                        $inc: {
                            "cart.$.quantity": 1
                        }
                    }
                )

                console.log('Product already exist on cart, quantity incremented by 1');

            }
        }

        res.redirect('/shoppingCart')
    } catch (error) {
        console.log(error.message);
    }
}

const updateCart = async (req, res, next) => {
    try {
        const userId = req.session.userId;
        const quantity = parseInt(req.body.amt)
        const prodId = req.body.prodId

        const pdtData = await Products.findById({ _id: prodId })

        const stock = pdtData.quantity
        let totalSingle

        //offer

        totalSingle = quantity * pdtData.price
        if (stock >= quantity) {
            await User.updateOne(
                { _id: userId, 'cart.productId': prodId },
                {
                    $set: {
                        'cart.$.quantity': quantity
                    }
                }
            )

            const userData = await User.findById({ _id: userId }).populate('cart.productId')
            let totalPrice = 0;
            let totalDiscount = 0
            userData.cart.forEach(pdt => {
                totalPrice += pdt.productPrice * pdt.quantity

                //offer


            })


            res.json({
                status: true,
                data: { totalSingle, totalPrice, totalDiscount }
            })

        } else {
            res.json({
                status: false,
                data: 'Sorry the product stock has been exceeded'
            })
        }

    } catch (error) {
        console.log(error.message);
    }
}


const removeCartItem = async (req, res, next) => {
    try {

        const pdtId = req.params.id;
        const userId = req.session.userId;

        const userData = await User.findOneAndUpdate(
            { _id: userId, 'cart.productId': pdtId },
            {
                $pull: {
                    cart: {
                        productId: pdtId
                    }
                }
            }
        );

        req.session.cartCount--;

        res.redirect('/shoppingCart')
    } catch (error) {
        console.log(error.message);
    }
}

const clearCart = async(req,res,next)=>{
    try {
        const userId = req.session.userId
    await User.updateOne({_id:userId},{$unset:{cart:""}})

     //cartCount
     let userDataForCount = await User.findOne({ _id: userId })
     req.session.cartCount = userDataForCount.cart.length

    res.redirect('/shoppingCart')
    } catch (error) {
        console.log(error);
    }
}

const loadProfile = async (req, res, next) => {
    try {
        const userId = req.session.userId;
        const userData = await User.findById({ _id: userId })
        const userAddress = await Addresses.findOne({ userId: userId })
        console.log('user:' + userAddress);
        res.render('userProfile', { userData, userAddress, isLoggedIn: true, page: 'Profile' })
    } catch (error) {
        console.log(error.message);
    }
}

const loadEditProfile = async (req, res, next) => {
    try {
        id = req.session.userId;
        const userData = await User.findById({ _id: id })
        res.render('editProfile', { userData })
    } catch (error) {
        next(error);
    }
}

const postEditProfile = async (req, res, next) => {
    try {
        const userId = req.session.userId;
        const { fname, lname, mobile, email } = req.body
        await User.findByIdAndUpdate(
            { _id: userId },
            {
                $set: {
                    fname, lname, mobile, email
                }
            }
        );

        res.redirect('/profile');

    } catch (error) {
        next(error);
    }
}

const loadChangePassword = async (req, res, next) => {
    try {
        res.render('changePass')
    } catch (error) {
        console.log(error.message)
    }
}

const postChangePassword = async (req, res, next) => {
    try {
        console.log('posted change password');

        const userId = req.session.userId;
        const { oldPassword, newPassword, confirmPassword } = req.body;
        // return res.send(req.body)

        if (newPassword !== confirmPassword) {
            return res.redirect('/profile/changePassword')
        }

        const userData = await User.findById({ _id: userId });

        const passwordMatch = await bcrypt.compare(oldPassword, userData.password);
        if (passwordMatch) {
            const sPassword = await securePassword(newPassword)
            // const sPassword = await bcrypt.hash(newPassword,10)
            await User.findByIdAndUpdate(
                { _id: userId },
                {
                    $set: {
                        password: sPassword
                    }
                }
            );
            return res.redirect('/profile');
        } else {
            return res.redirect('/profile/changePassword');
        }
    } catch (error) {
        console.log(error.message);
    }
}

const forgotPassword = async (req, res, next) => {
    try {
        console.log('loaded forgot password');
        const userMail = await User.findById({ _id: req.session.userId }, { email: 1, _id: 0 })
        const OTP = req.session.OTP = getOTP()
        sendVerifyMail(userMail.email, OTP);
        setTimeout(() => {
            req.session.OTP = null; // Or delete req.session.otp;
            console.log('otp time out');
        }, 600000);
        res.render('forgotPasswordVerification')

    } catch (error) {
        console.log(error);
    }
}

const verifyOTPforgotPass = async (req, res, next) => {
    try {
        const userOTP = req.body.OTP
        const adminOTP = req.session.OTP
        if (userOTP == adminOTP) {
            res.render('resetPassword')
        } else {
            console.log('OTP not matching .... :(');
            res.redirect('/profile/forgotPassword')
        }
    } catch (error) {
        console.log(error);
    }
}

const loadResetPassword = async (req, res, next) => {
    try {
        console.log('reset paswrd loaded');
        res.render('resetPassword')
    } catch (error) {
        console.log(error.message);
    }
}

const postResetPassword = async (req, res, next) => {
    try {
        const { newPassword, confirmPassword } = req.body
        if (newPassword !== confirmPassword) {
            return res.redirect('/profile/resetPassword');
        } else {
            const userId = req.session.userId;
            const sPassword = await securePassword(newPassword)
            await User.findByIdAndUpdate(
                { _id: userId },
                {
                    $set: {
                        password: sPassword
                    }
                }
            );
            console.log('password updated');
            return res.redirect('/profile');
        }
    } catch (error) {
        console.log(error);
    }
}

const loadWishlist = async(req, res, next) => {
    try {
        // console.log('loading wishlist');
        const userId = req.session.userId
        const isLoggedIn = Boolean(req.session.userId)
        const userData = await User.findById({_id:userId}).populate('wishlist')
        const wishlist = userData.wishlist
        res.render('wishlist',{page:'Wishlist', parentPage:'Shop', isLoggedIn, wishlist})
    } catch (error) {
        next(error)
    }
}

const addToWishlist = async(req, res, next) => {
    try {
        const { productId } = req.params
        const { userId } = req.session
        const userData = await User.findById({_id: userId});
        if(!userData.wishlist.includes(productId)){
            userData.wishlist.push(productId)
            await userData.save()
            req.session.wishCount++
        }
        let { returnPage } = req.query
        if(returnPage == 'shop'){
            res.redirect('/shop')
        }else if(returnPage == 'productOverview'){
            res.redirect(`/shop/productOverview/${productId}`)
        }
    } catch (error) {
        next(error)
    }
}


const removeWishlistItem = async(req, res, next) => {
    try {
        const { productId } = req.params
        const { userId } = req.session
        await User.findByIdAndUpdate(
            {_id: userId},
            {
                $pull:{
                    wishlist: productId
                }
            }
        );
        req.session.wishCount--
        const { returnPage } = req.query
        if(returnPage == 'shop'){
            res.redirect('/shop')
        }else if(returnPage == 'productOverview'){
            res.redirect(`/shop/productOverview/${productId}`)
        }else if(returnPage == 'wishlist'){
            res.redirect('/wishlist')
        }
    } catch (error) {
        next(error)
    }
}




module.exports = {
    loadHome,
    loadLogin,
    logoutUser,
    postLogin,
    loadRegister,
    postRegister,
    validateOTP,
    resendOTP,
    loadShoppingCart,
    addToCart,
    removeCartItem,
    updateCart,
    loadProfile,
    loadEditProfile,
    postEditProfile,
    loadChangePassword,
    postChangePassword,
    forgotPassword,
    verifyOTPforgotPass,
    loadResetPassword,
    postResetPassword,
    clearCart,
    loadWishlist,
    addToWishlist,
    removeWishlistItem
}


// new User({
//     name, //if both are same     save user
//     email: email
// }).save()