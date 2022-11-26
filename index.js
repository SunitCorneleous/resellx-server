const express = require("express");
const app = express();
const cors = require("cors");
var jwt = require("jsonwebtoken");
require("dotenv").config();
const port = process.env.PORT || 5000;

// middleware
app.use(express.json());
app.use(cors());

// mongodb config
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.jjvalws.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

//verify jwt
function verifyJWT(req, res, next) {
  // get authorization from header
  const authHeader = req.headers.authorization;

  // check if the header exists
  if (!authHeader) {
    return res.status(401).send("unauthorized access");
  }

  // split the token
  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "forbidden access" });
    }

    req.decoded = decoded;
    next();
  });
}

// mongodb run
async function run() {
  try {
    const categoriesCollection = client
      .db("resellxDB")
      .collection("categories");
    const usersCollections = client.db("resellxDB").collection("users");
    const productsCollections = client.db("resellxDB").collection("products");
    const bookingCollections = client.db("resellxDB").collection("booking");

    // verify seller
    const verifySeller = async (req, res, next) => {
      const decodedEmail = req.decoded.email;
      const filter = { email: decodedEmail };
      const user = await usersCollections.findOne(filter);

      if (user?.userType === "seller") {
        return next();
      }

      return res.status(403).send({ message: "forbidden access" });
    };

    // verify user
    const verifyUser = async (req, res, next) => {
      const decodedEmail = req.decoded.email;
      const filter = { email: decodedEmail };
      const user = await usersCollections.findOne(filter);

      if (user?.userType === "user") {
        return next();
      }

      return res.status(403).send({ message: "forbidden access" });
    };

    // get all categories
    app.get("/categories", async (req, res) => {
      const query = {};
      const categories = await categoriesCollection.find(query).toArray();
      res.send(categories);
    });

    // get products by category
    app.get("/category/:id", async (req, res) => {
      const categoryId = req.params.id;
      const categoryQuery = { _id: ObjectId(categoryId) };

      const category = await categoriesCollection.findOne(categoryQuery);

      const query = {};

      const allProducts = await productsCollections.find(query).toArray();

      const laptops = allProducts.filter(
        laptop => laptop.category === category.name
      );

      res.send(laptops);
    });

    //save user to db
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };

      const exists = await usersCollections.findOne(query);

      if (exists) {
        return res.send({ exists: true });
      }

      const result = await usersCollections.insertOne(user);
      res.send(result);
    });

    //get jwt
    app.get("/jwt", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const user = await usersCollections.findOne(query);

      if (user) {
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN_SECRET, {
          expiresIn: "7h",
        });
        return res.send({ accessToken: token });
      }

      res.status(403).send({ accessToken: "" });
    });

    // check user type
    app.get("/usertype", async (req, res) => {
      const email = req.query.email;
      const query = {};

      const allUsers = await usersCollections.find(query).toArray();
      const user = allUsers.find(user => user.email === email);

      res.send({ userType: user.userType });
    });

    // add products to db as seller
    app.post("/products", verifyJWT, verifySeller, async (req, res) => {
      const product = req.body;
      const sellerFilter = { email: product.sellerEmail };

      const postedTime = new Date();
      const sellerVerification = await usersCollections.findOne(sellerFilter);

      product.posted = postedTime;
      product.sellerVerification = sellerVerification.verified;
      product.saleStatus = "unsold";

      const result = await productsCollections.insertOne(product);

      console.log(result);

      res.send(result);
    });

    // get all products of seller by email
    app.get("/myproducts", verifyJWT, verifySeller, async (req, res) => {
      const email = req.query.email;
      const query = { sellerEmail: email };

      const products = await productsCollections.find(query).toArray();

      res.send(products);
    });

    //delete specific product by id
    app.delete("/products/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };

      const result = await productsCollections.deleteOne(query);

      res.send(result);
    });

    // save a product for advertisement
    app.get("/advertisement/:id", async (req, res) => {
      const productId = req.params.id;
      const query = { _id: ObjectId(productId) };

      const laptop = await productsCollections.findOne(query);
      const advertisedLaptop = { ...laptop, advertised: true };
      console.log(advertisedLaptop);

      const updatedDoc = {
        $set: advertisedLaptop,
      };
      const options = { upsert: true };

      const result = await productsCollections.updateOne(
        query,
        updatedDoc,
        options
      );

      console.log(result);
      res.send(result);
    });

    // get sdvertised products
    app.get("/advertisement", async (req, res) => {
      const query = { advertised: true, saleStatus: "unsold" };

      const advertisedLaptops = await productsCollections.find(query).toArray();

      res.send(advertisedLaptops);
    });

    // save booking to db
    app.post("/bookings", verifyJWT, verifyUser, async (req, res) => {
      const booking = req.body;

      const query = { productId: booking.productId, email: booking.email };

      const exists = await bookingCollections.findOne(query);

      if (exists) {
        return res.send({ product: "product already booked" });
      }

      const result = await bookingCollections.insertOne(booking);

      res.send(result);
    });
  } finally {
  }
}

run().catch(error => console.log(error));

// home route
app.get("/", (req, res) => {
  res.send("<h1>Resellx server is running</h1>");
});

// run app
app.listen(port, () => {
  console.log(`server is running at port ${port}`);
});
