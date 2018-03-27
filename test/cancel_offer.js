var MyToken = artifacts.require("./MyToken.sol");
var Market = artifacts.require("./market.sol");
var Ticket = artifacts.require("./ticket.sol");
expect = require("chai").expect;

contract("Market", function(accounts){
  // Contracts
  var c_Token;
  var c_Market;
  // Public member variables
  var m_tokenCreator;
  var m_marketCreator;
  var m_contractType;
  var m_tickVolume;
  var m_loadShape;
  var m_priceScale;
  var m_maxPrice = 100;
  var m_pricesLength = 101;

  const testSize = 5;
  var fs = require("fs");

  // Catch an instance of Token contract
  it("Catch an instance of the deployed contract (Token)", function(){
    return MyToken.new(100000,"RandomToken",0,"RT", {"from": accounts[5]}).then(function(instance){
      c_Token = instance;
    });
  });

  // Catch an instance of Market contract
  it("Catch an instance of the deployed contract (Market)", function(){
    return Market.new(c_Token.address, 1, 2, "Future", "Base", 2, 5, {"from": accounts[4]}).then(function(instance){
      c_Market = instance;
      e_TicketCreation = c_Market.ticketCreation({fromBlock: "0", toBlock: "latest"});
      e_NewOffer = c_Market.newOffer({fromBlock: "0", toBlock: "latest"});
    }).then(function(){
      return c_Token.transfer(c_Market.address, 10000, {"from": accounts[5]}).then(function(){
      });
    });
  });

  // Verify public variables of Market contract
  it("Check that values of public variables are correct", function(){
    var data;
    return c_Token.tokenCreator().then(function(res){
      m_tokenCreator = res;
      expect(m_tokenCreator).to.be.equal(accounts[5]);
    }).then(function(){
      return c_Market.marketOperator().then(function(res){
        m_marketCreator = res;
        expect(m_marketCreator).to.be.equal(accounts[4]);
      }).then(function(){
        return c_Market.contractType().then(function(res){
          m_contractType = res;
          expect(m_contractType).to.be.equal("Future");
        }).then(function(){
          return c_Market.tickVolume().then(function(res){
            m_tickVolume = res.toNumber();
            expect(m_tickVolume).to.be.equal(2);
          }).then(function(){
            return c_Market.loadShape().then(function(res){
              m_loadShape = res.toString();
              expect(m_loadShape).to.be.equal("Base");
            }).then(function(){
              return c_Market.priceScale().then(function(res){
                m_priceScale = res.toNumber();
                expect(m_priceScale).to.be.equal(m_maxPrice/(m_pricesLength-1));
                data = "\n      Public variables" +
                       "\n      ----------------" +
                       "\n      Token creator: " + m_tokenCreator +
                       "\n      Market operator: " + m_marketCreator +
                       "\n      Contract type: " + m_contractType +
                       "\n      Tick Volume (MWh): " + m_tickVolume +
                       "\n      Load shape: " + m_loadShape +
                       "\n      Price scale: " + m_priceScale +
                       "\n";
                console.log(data);
              });
            });
          });
        });
      });
    });
  });

  var i = 0;
  do {
    sendOffer(i);
    i ++;
  } while(i < testSize);

  var output = "PrevOffers,Price,Type,Quantity,Cancelled,PriceChange,TicketCreation,DummyOffers,ApproveGas,LaunchOfferGas,TotalGas\n";
  function sendOffer(_index){
    it("Send a new offer", function(){
      var matching = false;
      var priceChange = 0;
      var dummyOffers = 0;
      var aGas;
      var lGas;
      var tGas;
      var outputInfo;
      var agent;
      var price;
      var quantity;
      var type;
      var cancel;
      var ticketID = -1;
      var offerID = -1;
      var ticketsCreated = 0;
      var count = 0;
      var unitaryOfferInfo = "";
      var typeString = "Buying";

      // Read parameters of the offer
      fs.readFile('./test/Data.json', 'utf8', function (err, data) {
        if (err) throw err;
        var obj = JSON.parse(data);
        for (var i = 0; i < obj.length; i ++){
          if(i == _index){
            agent = accounts[obj[i].Agent];
            price = obj[i].Price;
            quantity = obj[i].Quantity*m_tickVolume;
            type = obj[i].Type;
            cancel = obj[i].Cancel;
          }
        }
      });

      // Check the initial state of the variables at the selected price
      return c_Market.getNumOffers(price/m_priceScale, 0).then(function(res){
        buyingOffers_num_before = res.toNumber();
      }).then(function(){
        return c_Market.getNumOffers(price/m_priceScale, 1).then(function(res){
          sellingOffers_num_before = res.toNumber();
        }).then(function(){
          // Agent must have some tokens in its account
          return c_Token.transfer(agent, 1000, {"from": m_tokenCreator}).then(function(){
            // Agent must approve the contract to spend its funds
            return c_Token.approve(c_Market.address, price * quantity, {"from": agent}).then(function(result){
              aGas = result.receipt.gasUsed;
              // Launch the offer
              return c_Market.launchOffer(price, quantity, type, {"from": agent}).then(function(result){
                lGas = result.receipt.gasUsed;
                // Catch the events
                e_NewOffer.watch(function(err,eventResponse){
                  if(eventResponse.args._type){typeString = "Selling";}
                  if(offerID < eventResponse.args._offerID.toNumber()){
                    offerID = eventResponse.args._offerID.toNumber();
                    count ++;
                    unitaryOfferInfo += "\n      Unitary Offer" +
                                        "\n      -------------" +
                                        "\n      Price ID: " + eventResponse.args._priceID.toNumber() +
                                        "\n      Offer ID: " + offerID +
                                        "\n      Type: " + typeString +
                                        "\n      Quantity: " + "1" +
                                        "\n";
                    // Get output variables
                    if(price != eventResponse.args._price.toNumber()){priceChange ++;}
                  }
                  offerInfo = "\n    =>Event: New Offer" +
                              "\n             Price: " + price +
                              "\n             Price ID: " + price/m_priceScale +
                              "\n             Type: " + typeString +
                              "\n             Quantity: " + quantity/m_tickVolume +
                              "\n             Agent: " + agent +
                              "\n             Gas: " + lGas +
                              "\n";
                });
                // Tickets will not always be created
                e_TicketCreation.watch(function(err,eventResponse){
                  if(!err){
                    matching = true;
                    if(eventResponse.args._ticketID.toNumber() % 2 == 0){
                      ticketAddressA = eventResponse.args._ticketAddress;
                    }else{
                      ticketAddressB = eventResponse.args._ticketAddress;
                    }
                    if(ticketID < eventResponse.args._ticketID.toNumber()){
                      ticketID = eventResponse.args._ticketID.toNumber();
                      ticketsCreated ++;
                    }
                  }
                });
                // Get the final state of the variables at the selected price
                return c_Market.getNumOffers(price/m_priceScale, 0).then(function(res){
                  buyingOffers_num_after = res.toNumber();
                }).then(function(){
                  return c_Market.getNumOffers(price/m_priceScale, 1).then(function(res){
                    sellingOffers_num_after = res.toNumber();
                  }).then(function(){
                    return c_Market.getAccrued(price/m_priceScale, 0).then(function(res){
                      buyingAccrued_after = res.toNumber();
                    }).then(function(){
                      return c_Market.getAccrued(price/m_priceScale, 1).then(function(res){
                        sellingAccrued_after = res.toNumber();
                        priceInfo = "\n      Price Information" +
                                    "\n      -----------------" +
                                    "\n      ID: " + price/m_priceScale +
                                    "\n      Value: " + price +
                                    "\n      Total Buying Offers: " + buyingOffers_num_after +
                                    "\n      Total Selling Offers: " + sellingOffers_num_after +
                                    "\n      Buying Accrued: " + buyingAccrued_after +
                                    "\n      Selling Accrued: " + sellingAccrued_after +
                                    "\n";
                        console.log(offerInfo);
                        if(quantity/m_tickVolume != 1){
                          console.log("      " + count + " Unitary Offers have been created\n" + unitaryOfferInfo);
                        }else{
                          console.log("      Unitary Offer created\n" + unitaryOfferInfo);
                        }
                        if(count != quantity/m_tickVolume){dummyOffers = count - quantity/m_tickVolume;}
                        // console.log(priceInfo);
                        // Add the output information
                        tGas = aGas + lGas;
                        outputInfo = (_index) + "," + price + "," + typeString + "," + quantity/m_tickVolume + "," + cancel + "," + priceChange;
                        output += outputInfo + "," + ticketsCreated/2 + "," + dummyOffers + "," + aGas + "," + lGas + "," + tGas + "\n";
                        // Write the output file when test is finished
                        if (_index == testSize - 1){
                          fs.writeFile("./test/output.csv", output, function (err) {
                            if (err)
                            return console.log(err);
                            console.log("      Wrote test information in file output.csv, just check it\n");
                          });
                        }
                        if(cancel != 0){
                          // Cancel the offer
                          return c_Market.cancelOffer(offerID, {"from": agent}).then(function(){
                            cancelled = "\n      Cancelled Offer" +
                                        "\n      ---------------" +
                                        "\n      Price ID: " + price/m_priceScale +
                                        "\n      Offer ID: " + offerID +
                                        "\n      Type: " + typeString +
                                        "\n";
                            console.log("\n      Last offer has been cancelled\n" + cancelled + "\n");
                          });
                        }
                        // Print Tickets information if two offers have matched
                        if(matching){
                          c_Ticket = Ticket.at(ticketAddressA);
                          return c_Ticket.ID().then(function(res){
                            tID = res.toNumber();
                          }).then(function(){
                            return c_Ticket.user().then(function(res){
                              tUser = res;
                            }).then(function(){
                              return c_Ticket.getBalance({"from": tUser}).then(function(res){
                                tBalance = res.toNumber();
                              }).then(function(){
                                return c_Ticket.ticketPrice().then(function(res){
                                  tPrice = res.toNumber();
                                }).then(function(){
                                  return c_Ticket.ticketType().then(function(res){
                                    tType = "Buying";
                                    if(res){tType = "Selling";}
                                    ticketInfo =  "\n    =>Event: New Ticket" +
                                                  "\n             ID: " + tID +
                                                  "\n             Address: " + ticketAddressA +
                                                  "\n             User: " + tUser +
                                                  "\n             Price: " + tPrice +
                                                  "\n             Type: " + tType +
                                                  "\n             Initial Balance: " + tBalance +
                                                  "\n";
                                    // console.log(ticketInfo);
                                  }).then(function(){
                                    c_Ticket = Ticket.at(ticketAddressB);
                                    return c_Ticket.ID().then(function(res){
                                      tID = res.toNumber();
                                    }).then(function(){
                                      return c_Ticket.user().then(function(res){
                                        tUser = res;
                                      }).then(function(){
                                        return c_Ticket.getBalance({"from": tUser}).then(function(res){
                                          tBalance = res.toNumber();
                                        }).then(function(){
                                          return c_Ticket.ticketPrice().then(function(res){
                                            tPrice = res.toNumber();
                                          }).then(function(){
                                            return c_Ticket.ticketType().then(function(res){
                                              tType = "Buying";
                                              if(res){tType = "Selling";}
                                              ticketInfo =  "\n    =>Event: New Ticket" +
                                                            "\n             ID: " + tID +
                                                            "\n             Address: " + ticketAddressB +
                                                            "\n             User: " + tUser +
                                                            "\n             Price: " + tPrice +
                                                            "\n             Type: " + tType +
                                                            "\n             Initial Balance: " + tBalance +
                                                            "\n";
                                              // console.log(ticketInfo);
                                            });
                                          });
                                        });
                                      });
                                    });
                                  })
                                });
                              });
                            });
                          });
                        }
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  }

  it("Stop watching events", function(){
    e_NewOffer.stopWatching();
    e_TicketCreation.stopWatching();
  });

});
